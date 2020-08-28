const secrets = require('../secrets')
const config = require('../config')
const imageFetch = require('./imageFetch')
// const fs = require('fs')

const Discord = require('discord.js')
const { makeCache } = require('./fileController')
const client = new Discord.Client()

client.on('ready', () => {
  console.log('Caroline is ready.')
  //client.user.setActivity('im 13 years old')
  client.user.setStatus('invisible')
  makeCache()
})

const getWarningEmbed = (authorid, matchingLinks) => {
  return {
    description: `Uh, actually <@${authorid}>, somebody has already posted this image in general. ${config.muteUsers ? 'You have been muted for 5 minutes.' : ''}`,
    color: 14070718,
    fields: matchingLinks
  }
}

let processQueue = []
let processing = false

const recurseProcessingQueue = () => {
  processing = false
  processQueue.shift()
  if(processQueue.length) fullImageCheck()
}


const fullImageCheck = () => {
  if (processing || !processQueue.length) return
  processing = true
  if (processQueue.length > 1) console.log(`Process Queue: ${JSON.stringify(processQueue.map(m => m.id))}`)
  const msg = processQueue[0]

  if (msg.channel.id !== secrets.generalID || msg.author === client.user || !msg.member ) { //|| msg.member.hasPermission('KICK_MEMBERS')
    recurseProcessingQueue()
    return
  }else{
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
      recurseProcessingQueue()
      return
    }).catch(error => {
      console.log(error)
      recurseProcessingQueue()
    })
  }
}

const mutedList = []

client.on('message', msg => {
  if (msg.channel.type === 'dm') console.log(`DM: ${msg.author.tag}: ${msg.cleanContent}`)

  mutedList.forEach((entry, index) => {
    if (entry.timeout < msg.createdTimestamp) {
      const memb = msg.guild.members.cache.get(entry.authorID)
      if (memb) {
        mutedList.splice(index, 1)
        memb.roles.remove(secrets.role_voteMuted).catch()
      }
    }
  })

  processQueue.push(msg)
  fullImageCheck()

  /* Ignore this part */
  if(msg.author.username === 'Taylor'){
    const trolloptions = ["hey, i miss you...", "fuck you", "can you give me rep", "h", "I can see you.", "bitch", "cum sex", "8=D <-- this is ur one haha", "i hate you", "<3", "whore", "dummy", "lol you forgot to not be a big dummy", "s"]
    if(Math.floor(Math.random() * 10) === 0){
      msg.author.send(trolloptions[Math.floor(Math.random() * trolloptions.length)]).then(newm => console.log(newm.content))
    }
  }
})

client.on('messageUpdate', (oldMsg, newMsg) => {
  if (oldMsg.cleanContent !== newMsg.cleanContent) {
    processQueue.push(newMsg)
  }
})

client.login(secrets.token)
