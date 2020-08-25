const fs = require('fs')
const FileType = require('file-type')
const request = require('request')
const gm = require('gm')
const config = require('../config')
const path = require('path')

const inboundPath = path.join(__dirname, 'inbound')
const outboundPath = path.join(__dirname, 'outbound')
const comparisons = path.join(__dirname, 'comparisons')

const imageType = (imageURL) => {
  const match = imageURL.match(/\.(png|jpg|gif|bmp)$/)
  if (match && match[1]) return match[1]
  return null
}

const getMessageImages = (msg) => { // Take the embeds(s)/attachment(s) from a message.
  const images = []

  msg.attachments.each(attachment => {
    images.push(attachment.url)
  })
  msg.embeds.forEach(embed => {
    const thumbnailLink = embed.thumbnail ? embed.thumbnail.url : null
    const embedLink = thumbnailLink || embed.url || (embed.fields[0] ? embed.fields[0].value : null)
    if(!embedLink) return
    images.push(embedLink)
  })
  if(!images.length){
    // Sometimes images with embeds hosted on discord don't count as "embeds" or "attachments", so I'm forced to take the link from the message.
    const matchURL = msg.cleanContent.match(/http(s):\/\/.*.(png|jpg|gif|bmp)/gm)
    return matchURL || []
  }
  return images
}

const gifToPNG = (path) => {
  return new Promise((resolve, reject) => {
    const newPath = path.replace('.gif', '.png')
    gm(path).selectFrame(0).write(newPath, (err) => { // Convert the first frame of the gif to a png, and write it.
      if (err) reject(err)
      setTimeout(() => {
        fs.unlink(path, (errUnlink) => { //Delete the old gif, when you feel like it.
          if (errUnlink) reject(errUnlink)
          resolve(newPath)
        })
      }, 3000)
    })
  })
}

const downloadImage = (url, id, type, callback) => {
  const downPath = path.join(__dirname, 'inbound', `${id}.${type}`)
  request.head(url, (_err, _res, _body) => {
    request(url).pipe(fs.createWriteStream(downPath)).on('close', (f) => { //Save image to inbound folder
      FileType.fromFile(downPath).then(type => { // Get the real filetype of it
        if (type && type.ext && imageType(`.${type.ext}`)) {
          if (type.ext === 'gif') {
            gifToPNG(downPath).then(callback)
          } else {
            callback(downPath)
          }
        } else {
          // Invalid filetype
          fs.unlink(downPath, (err) => {
            if (err) console.log(err)
            console.log('Deleted invalid file from inbound folder')
          })
        }
      })
    })
  })
}

const compareImage = (newImagePath, compDir, f) => {
  return new Promise((resolve, reject) => {
    gm.compare(newImagePath, compDir,  (err, isEqual, equality, raw) => { // Compare inbound and outbound
      if(err) reject(err)
      if(equality < config.similarityValue){ // If they're similar enough
        if(config.devMode){
          const devPath = path.join(comparisons, f)
          gm(compDir).montage(newImagePath).geometry('+10+10') // Make a picture showing the diff
          .write(devPath, (err => { // Save the picture to comparisons
              if(err) reject(err)
              resolve({matches: true, devPath, equality})
          }))
        } else {
          resolve({matches: true, equality})
        }
      } else {
        resolve({matches: false, equality})
      }
    })
  })
}

const compareImages = (newImagePath, doMatch) => {
  return new Promise((resolve, reject) => {
    fs.readdir(outboundPath, (err, outFiles) => { // Get all files in the outbound folder
      const promises = []
      outFiles.forEach(f => { // For each of them
        const compDir = path.join(outboundPath, f)
        promises.push(compareImage(newImagePath, compDir, f))
      })
      Promise.all(promises).then(vals => {
        const findRepost = vals.filter(val => !!val.matches)
        if(findRepost.length > 0){
          resolve({repost: true, values: findRepost})
        }else{
          resolve({repost: false})
        }
      })
    })
  })
}

const run = (msg) => {
  return new Promise((resolve, reject) => {
    getMessageImages(msg).forEach(imageURL => {
      const id = `${msg.author.id}_${msg.id}_${msg.createdTimestamp}`
      const type = imageType(imageURL)
      if (type) {
        downloadImage(imageURL, id, type, (imagePath) => {
          const [updatedFileName] = imagePath.split("/").slice(-1);
          compareImages(imagePath).then(result => {
            if(result.repost){
              fs.unlink(imagePath, (err) => {
                if(err) reject({message: 'Error deleting repost.', file: updatedFileName})
                resolve(result)
              })
            } else {
              fs.rename(imagePath, path.join(outboundPath, updatedFileName), (err) => {
                if(err) reject({message: 'Error moving non-repost to outbound folder.', file: updatedFileName})
                resolve(result)
              })
            }
          })
        })
      }
    })
  })
}

module.exports = run
