const fs = require('fs')
const FileType = require('file-type')
const request = require('request')
const gm = require('gm')
const config = require('../config')
const path = require('path')
const { addImageAttempt, getCached } = require('./fileController')
const url = require("url")

const outboundPath = path.join(__dirname, 'outbound')

/**
 * Still in use, but to be removed soon.
 * @deprecated
 */
const imageType = (imageURL) => {
  const match = imageURL.match(/\.(png|jpg|gif|bmp)$/)
  if (match && match[1]) return match[1]
  return null
}

/**
 * Extract a unique set of image links from a message
 * @param {Discord.Message} msg The message the user sent
 * @returns {Array<String>} Image URL's or empty array
 */
const getMessageImages = msg => {
	// To make URL's added exclusive
	let images = new Set();

	// Check attachment(s)
	msg.attachments.each(m => {
		// Loop through all attachments, find any with notable width parameter (image)
		if (m.width && m.width>64) images.add(cleanLink(m.url));
	});

	// Check embed(s)
	for (let i = 0; i < msg.embeds.length; i++) {
		if (msg.embeds[i].image) images.add(cleanLink(msg.embeds[i].image.url));
		if (msg.embeds[i].thumbnail) images.add(cleanLink(msg.embeds[i].thumbnail.url));
	}
	// Match text content
	if (msg.cleanContent) {
		let r = msg.cleanContent.match(/https:\/\/.+\.(discordapp|imgur|vgy|tenor)\.(com|net|me)\/[^.]+\.(png|jpg|gif|bmp)/gm) || [];
		r.forEach(link => images.add(cleanLink(link)))
	}

	return Array.from(images);
}

/**
 * Clear away any query strings and anchors in links
 * @param {String} imageLink The link to clean up
 * @returns {String}
 */
const cleanLink = imageLink => {
	if (/\.(png|jpg|gif|bmp)$/.test(imageLink)) return imageLink;

	// Deconstruct URL
	let r = url.parse(imageLink);
	// Replace #hash and ?k=v&a=b with nothing
	return imageLink.replace(r.hash,"").replace(r.search, "");
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

recurseChunks = (chunks, newImagePath, finishedCallback) => {
  if(chunks.length){
    const chunk = chunks[0]
    const chunkPromises = []
    chunk.forEach(f => {
      const compDir = path.join(outboundPath, f)
      chunkPromises.push(compareImageHeavy(newImagePath, compDir, f))
    })
  
    Promise.all(chunkPromises).then(vals => {
      const findRepost = vals.filter(val => !!val.matches)
      if (findRepost.length > 0) {
        console.log(`-- Comparison found matching results in chunk ${chunkNum}/${chunks.length}`)
        finishedCallback({ repost: true, values: findRepost })
        return
      } else {
        if(chunks[1]){
          chunks.pop()
          return recurseChunks(chunks, newImagePath, finishedCallback)
        }else{
          console.log('-- Comparison found no matching results.')
          finishedCallback({repost: false})
        }
      }
    }).catch(console.log)
  }
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
        const fileCache = [...getCached(path.join(__dirname, 'store', 'imageCache.json')).data]
        
        if(fileCache.length >= 10){
          let orderedFiles = fileCache.map(f => f.p)
          let chunks = [...Array(Math.ceil(orderedFiles.length/2))].map((chunk, i) => {
            return orderedFiles.splice(orderedFiles.length === 1 ? 0 : Math.ceil(orderedFiles.length/2), orderedFiles.length === 1 ? 1 : orderedFiles.length-1)
          }).filter(f => f.length).reverse()
          recurseChunks(chunks, newImagePath, resolve)
        }else{
          recurseChunks([outFiles], newImagePath, resolve)
        }
      }
    })
  })
}

const run = (msg) => {
  return new Promise((resolve, reject) => {
    const allImages = getMessageImages(msg)
    if(allImages.length){
      allImages.forEach(imageURL => {
        const id = `${msg.author.id}_${msg.id}_${msg.createdTimestamp}`
        const type = imageType(imageURL)
        if (type) {
          console.log(`Downloading image: ${imageURL}`)
          downloadImage(imageURL, id, type, (imagePath) => {
            const [updatedFileName] = imagePath.split('/').slice(-1)
            compareImages(imagePath).then(result => {
              if (result.repost) {
                fs.unlink(imagePath, (err) => {
                  result.values.forEach(val => {
                    const [oldFileName] = val.devPath.split('/').slice(-1)
                    addImageAttempt(oldFileName)
                  })
                  if (err) reject(err)
                  resolve(result)
                })
              } else {
                fs.rename(imagePath, path.join(outboundPath, updatedFileName), (err) => {
                  if (err) reject(err)
                  addImageAttempt(updatedFileName)
                  resolve(result)
                })
              }
            })
          })
        }
      })
    }else{
      resolve({repost: false})
    }
  })
}

module.exports = run
