const fs = require('fs')
const request = require('request')
const imageCheck = require('./imageCheck')

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

const downloadImage = (url, id, type, callback) => {
  request.head(url, (_err, _res, _body) => {
    request(url).pipe(fs.createWriteStream(`${__dirname}/inbound/${id}.${type}`)).on('close', callback)
  })
}

const run = (msg, client) => {
  getMessageImages(msg).forEach(imageURL => {
    const id = `${msg.author.id}_${msg.id}_${msg.createdTimestamp}`

    const type = imageType(imageURL)
    if (type === 'gif') {
      // TODO: Download, and then convert first frame to png and save
      return false
    } else if (type) {
      downloadImage(imageURL, id, type, () => {
        if (!imageCheck.locked) imageCheck.runCheck(client) // Force imageCheck to run after the image is downloaded.
      })
    }
  })
}

module.exports = run
