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

const getWarningEmbed = (msg, edit = false) => {
  const emb = edit ? msg.embeds[0] : { ...config.defaultEmbed }

  emb.description = emb.description.length ? emb.description
    : `Uh, actually <@${msg.author.id}>, somebody has already posted this image in general. ${config.muteUsers ? 'You have been muted for 5 minutes.' : ''}`

  if (config.devMode) {
    emb.fields[0] = {
      name: '------',
      value: `Sensitivity: ${Math.round(config.similarityValue * 1000) / 1000} (0 = identical)
      Mute Users: ${config.muteUsers}
      Delete Messages: ${config.deleteMessages}
      ${edit ? '' : `
      The following attachment(s) show the difference between the image you posted \
      (left) and the old image (right).`}`,
      inline: true
    }
  } else {
    emb.fields = []
  }

  return emb
}

const reactWithSettings = (msg) => {
  /*if (config.devMode) {
    msg.react('⬆️')
      .then(() => msg.react('⬇️'))
      .then(() => msg.react('🙊'))
      .then(() => msg.react('🗑️'))
      .then(() => msg.react('⚙️'))
  } else {
    msg.react('⚙️')
  }*/
}

const fullImageCheck = (msg) => {
  if (msg.channel.id !== secrets.generalID) return
  if (msg.author === client.user) return
  if (msg.member && (msg.member.hasPermission('KICK_MEMBERS') && !msg.author.id === '162720455801700352')) return
  imageFetch(msg).then(result => {
    if (result.repost) {
      msg.reply({ embed: getWarningEmbed(msg) }).then((herMsg) => {
        if (config.devMode) {
          const files = result.values.slice(0, 10).map(v => new Discord.MessageAttachment(v.devPath))
          msg.reply({ files: files })
        }
        reactWithSettings(herMsg)
      })
      if (config.deleteMessages) msg.delete()
      if (config.muteUsers) {
        const voteMuted = msg.guild.roles.cache.find(r => r.name === 'votemuted')
        msg.member.roles.add(voteMuted)
        mutedList.push({
          authorID: msg.author.id,
          timeout: new Date().getTime() + (5 * 1000 * 60)
        })
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
      const voteMuted = msg.guild.roles.cache.find(r => r.name === 'votemuted')
      if (memb) {
        mutedList.splice(index, 1)
        msg.member.roles.remove(voteMuted)
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

client.on('messageReactionAdd', (reaction, user) => {
  if (user === client.user || reaction.message.author !== client.user) return
  
  const member = reaction.message.channel.guild.members.cache.get(user.id)
  if (!member || !member.hasPermission('KICK_MEMBERS')) return

  reaction.message.reactions.removeAll()

  if (reaction.emoji.name === '⬆️') config.similarityValue += 0.005
  if (reaction.emoji.name === '⬇️') config.similarityValue -= 0.005
  if (reaction.emoji.name === '🙊') config.muteUsers = !config.muteUsers
  if (reaction.emoji.name === '🗑️') config.deleteMessages = !config.deleteMessages
  if (reaction.emoji.name === '⚙️') config.devMode = !config.devMode

  reaction.message.edit({ embed: getWarningEmbed(reaction.message) })
  reactWithSettings(reaction.message)
})

client.login(secrets.token)
