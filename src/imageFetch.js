const fs = require('fs')
const FileType = require('file-type')
const request = require('request')
const gm = require('gm')
const config = require('../config')
const path = require('path')

const outboundPath = path.join(__dirname, 'outbound')

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
    if (!embedLink) return
    if (imageType(embedLink)) {
      images.push(embedLink)
    }
  })
  if (!images.length) {
    // Sometimes images with embeds hosted on discord don't count as "embeds" or "attachments", so I'm forced to take the link from the message.
    // Whitelisting discordapp.net so as not to expose the IP to external servers. I think this bug only happens when hosted on discord anyway.
    const matchURL = msg.cleanContent.match(/https:\/\/.+\.(discordapp|imgur|vgy)\.(com|net|me)\/[^.]+\.(png|jpg|gif|bmp)/gm)
    if (matchURL) images.push(matchURL[0])
  }
  return images
}

const gifToPNG = (path) => {
  return new Promise((resolve, reject) => {
    const newPath = path.replace('.gif', '.png')
    gm(path).selectFrame(0).write(newPath, (err) => { // Convert the first frame of the gif to a png, and write it.
      if (err) reject(err)
      setTimeout(() => {
        fs.unlink(path, (errUnlink) => { // Delete the old gif, when you feel like it.
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
    request(url).pipe(fs.createWriteStream(downPath)).on('close', (f) => { // Save image to inbound folder
      FileType.fromFile(downPath).then(type => { // Get the real filetype of it
        if (type && type.ext && imageType(`.${type.ext}`)) {
          if (type.ext === 'gif') {
            console.log('- Converting GIF to PNG')
            gifToPNG(downPath).then(callback)
          } else {
            callback(downPath)
          }
        } else {
          // Invalid filetype
          fs.unlink(downPath, (err) => {
            if (err) console.log(err)
            console.log('- Deleted invalid file from inbound folder')
          })
        }
      })
    })
  })
}

const compareImageHeavy = (newImagePath, compDir, f) => {
  return new Promise((resolve, reject) => {
    gm.compare(newImagePath, compDir, (err, isEqual, equality, raw) => { // Compare inbound and outbound
      if (err) reject(err)
      if (equality < (config.similarityValue / 1000)) { // If they're similar enough
        resolve({ matches: true, devPath: compDir, equality })
      } else {
        resolve({ matches: false, equality })
      }
    })
  })
}

const compareImages = (newImagePath) => {
  return new Promise((resolve, reject) => {
    fs.readdir(outboundPath, (err, outFiles) => { // Get all files in the outbound folder
      if (err) reject(err)

      const newBMP = fs.readFileSync(newImagePath, 'base64')

      console.log('- Attempting quick comparison')
      let bufferFound = false
      outFiles.some(f => {
        const compDir = path.join(outboundPath, f)
        if (fs.readFileSync(compDir, 'base64') === newBMP) { // Before doing a heavy compare of the images, try to find one with an identical buffer.
          bufferFound = true
          console.log('- Found identical image')
          resolve({ repost: true, values: [{ matches: true, devPath: compDir, equality: 0 }] }) // If we find one identical one, no point looking for more.
        }
      })

      if (!bufferFound) {
        console.log('- Attempting full comparison')
        const promises = []
        outFiles.forEach(f => { // For each of them
          const compDir = path.join(outboundPath, f)
          promises.push(compareImageHeavy(newImagePath, compDir, f))
        })

        Promise.all(promises).then(vals => {
          const findRepost = vals.filter(val => !!val.matches)
          if (findRepost.length > 0) {
            console.log('- Comparison found matching results.')
            resolve({ repost: true, values: findRepost })
          } else {
            console.log('- Comparison found no matching results.')
            resolve({ repost: false })
          }
        })
      }
    })
  })
}

const run = (msg) => {
  return new Promise((resolve, reject) => {
    getMessageImages(msg).forEach(imageURL => {
      const id = `${msg.author.id}_${msg.id}_${msg.createdTimestamp}`
      const type = imageType(imageURL)
      if (type) {
        console.log(`Downloading image: ${imageURL}`)
        downloadImage(imageURL, id, type, (imagePath) => {
          const [updatedFileName] = imagePath.split('/').slice(-1)
          compareImages(imagePath).then(result => {
            if (result.repost) {
              fs.unlink(imagePath, (err) => {
                if (err) reject(err)
                resolve(result)
              })
            } else {
              fs.rename(imagePath, path.join(outboundPath, updatedFileName), (err) => {
                if (err) reject(err)
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
