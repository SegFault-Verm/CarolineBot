const fs = require('fs')
const FileType = require('file-type')
const request = require('request')
const imageCheck = require('./imageCheck')
const gm = require('gm')

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
    const embedLink = embed.url || embed.fields[0].value
    images.push(embedLink)
  })
  return images
}

const gifToPNG = (path) => {
  return new Promise((resolve, reject) => {
    gm(path).selectFrame(0).write(path, (err) => {
      if (err) reject(err)
      resolve(path)
    })
  })
}

const downloadImage = (url, id, type, gif, callback) => {
  const path = `${__dirname}/inbound/${id}.${type}`
  request.head(url, (_err, _res, _body) => {
    request(url).pipe(fs.createWriteStream(path)).on('close', (f) => {
      FileType.fromFile(path).then(type => {
        if (type && type.ext && imageType(`.${type.ext}`)) {
          if (type.ext === 'gif') {
            gifToPNG(path).then(callback())
          }
          callback()
        } else {
          // The filetype was valid in the URL, but the actual file type is not valid!
          fs.unlink(path, (err) => {
            if (err) console.log(err)
            console.log('Deleted invalid file from inbound folder')
          })
        }
      })
    })
  })
}

const run = (msg, client) => {
  getMessageImages(msg).forEach(imageURL => {
    const id = `${msg.author.id}_${msg.id}_${msg.createdTimestamp}`

    const type = imageType(imageURL)
    if (type) {
      downloadImage(imageURL, id, type, false, () => {
        if (!imageCheck.locked) imageCheck.runCheck(client) // Force imageCheck to run after the image is downloaded.
      })
    }
  })
}

module.exports = run
