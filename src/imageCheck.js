const fs = require('fs')
const path = require('path')
const { removeDuplicates } = require('dupe-images')
const secrets = require('../secrets')

const inboundPath = path.join(__dirname, 'inbound')
const outboundPath = path.join(__dirname, 'outbound')

let locked = false

const punishUser = (client, imgDeats) => {
  client.channels.cache.get(secrets.generalID).messages.fetch(imgDeats[1]).then(msg => {
    if (msg) {
      msg.delete()
      msg.reply('Uh, actually, somebody already posted that image in general.')
    }
  }).catch(() => null)
}

const runCheck = (client) => {
  if (locked) return false // This isn't clean, but this bot was never meant to be serious.
  locked = true

  fs.readdir(inboundPath, (err, files) => { // Get the files in the inbound directory
    if (err) console.log(err)
    if (files && files[0]) { // Only take the first one
      const oldDir = path.join(inboundPath, files[0])
      const newDir = path.join(outboundPath, files[0])
      fs.rename(oldDir, newDir, (err) => { // Move it to the new directory
        if (err) console.log(err)

        removeDuplicates(outboundPath, { exact: false, tolerance: 0.5 }).then(results => {
          // Delete dupes in the new directory
          if (!!results && results.retained.length && results.removed.length) {
            // The deduplication library keeps the "best" image not the newer or older one, so we need to read the timestamp of the retained/removed.
            const parts1 = results.retained[0].name.match(/([0-9]+)/gm)
            const parts2 = results.removed[0].name.match(/([0-9]+)/gm)

            const timestamp1 = Number(parts1[2])
            const timestamp2 = Number(parts2[2])

            if (timestamp1 > timestamp2) {
              punishUser(client, parts1)
            } else {
              punishUser(client, parts2)
            }
          }

          locked = false
        })
      })
    } else {
      locked = false
    }
  })
}

module.exports = {
  runCheck,
  locked
}
