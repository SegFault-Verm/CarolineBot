// var {findDuplicates, removeDuplicates} = require('dupe-images');
// findDuplicates(`${__dirname}\\images`).then(console.log)
const secrets = require('../secrets')
const imageFetch = require('./imageFetch')
const imageCheck = require('./imageCheck')

const Discord = require('discord.js')
const client = new Discord.Client()

client.on('ready', () => {
  console.log('Caroline is ready.')
})

client.on('message', msg => {
  if (msg.channel.id !== secrets.generalID) return
  imageFetch(msg, client) // Images are downloaded to 'queue' folder.
  if (!imageCheck.locked) imageCheck.runCheck(client) // runCheck moves them from the queue for comparison.
})

client.login(secrets.token)
