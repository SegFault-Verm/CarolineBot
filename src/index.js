const secrets = require('../secrets')
const config = require('../config')
const imageFetch = require('./imageFetch')
// const fs = require('fs')

const Discord = require('discord.js')
const client = new Discord.Client()

client.on('ready', () => {
  console.log('Caroline is ready.')
  client.user.setActivity('im 13 years old')
})

const getWarningEmbed = (authorid, matchingLinks) => {
  return {
    description: `Uh, actually <@${authorid}>, somebody has already posted this image in general. ${config.muteUsers ? 'You have been muted for 5 minutes.' : ''}`,
    color: 14070718,
    fields: matchingLinks
  }
}

const fullImageCheck = (msg) => {
  if (msg.channel.id !== secrets.generalID) return
  if (msg.author === client.user) return
  if (msg.member && (msg.member.hasPermission('KICK_MEMBERS') && !msg.author.id === '162720455801700352')) return
  imageFetch(msg).then(result => {
    if (result.repost) {
      const matchingFieldList = result.values.sort((a, b) => a.equality - b.equality).map(val => {
        const messageID = val.devPath.split('/').slice(-1)[0].split('_')[1]
        const messageLink = `https://discordapp.com/channels/${msg.guild.id}/${msg.channel.id}/${messageID}`
        const fieldVal = {
          name: `${(val.equality * 1000).toFixed(2)}% different to:`,
          value: messageLink
        }
        return fieldVal
      }).slice(0, 9)

      msg.reply({ embed: getWarningEmbed(msg.author.id, matchingFieldList) })
      if (config.muteUsers) {
        msg.member.roles.add(secrets.role_voteMuted).then(() => { if (config.deleteMessages) msg.delete() }).catch(console.log)
        mutedList.push({
          authorID: msg.author.id,
          timeout: new Date().getTime() + (5 * 1000 * 60)
        })
      } else {
        if (config.deleteMessages) msg.delete()
      }
    }
  })
}

const mutedList = []
client.on('message', msg => {
  if (msg.channel.type === 'dm') {
    console.log(`DM: ${msg.author.tag}: ${msg.cleanContent}`)
    if (Math.floor(Math.random() * 10) === 0) {
      msg.reply("uh, I'm 13..").then(newM => console.log(newM.content)).catch(console.log)
    }
    return
  }

  mutedList.forEach((entry, index) => {
    if (entry.timeout < msg.createdTimestamp) {
      const memb = msg.guild.members.cache.get(entry.authorID)
      if (memb) {
        mutedList.splice(index, 1)
        memb.roles.remove(secrets.role_voteMuted).catch()
      }
    }
  })

  fullImageCheck(msg)
})

client.on('messageUpdate', (oldMsg, newMsg) => {
  if (oldMsg.cleanContent !== newMsg.cleanContent) {
    fullImageCheck(newMsg)
  }
})

client.login(secrets.token)
