const secrets = require('../secrets')
const config = require('../config')
const imageFetch = require('./imageFetch')

const Discord = require('discord.js')
const client = new Discord.Client()

client.on('ready', () => {
  console.log('Caroline is ready.')
  client.user.setActivity("im 13 years old"); 
})

const getWarningEmbed = (msg, edit=false) => {

  const emb = edit ? msg.embeds[0] : config.defaultEmbed

  emb.description = emb.description.length ? emb.description :
    `Uh, actually <@${msg.author.id}>, somebody has already posted this image in general.`

  if (config.devMode) {
    emb.fields[0] = {
      "name": "------",
      "value": `Sensitivity: ${Math.round(config.similarityValue * 1000) / 1000} (0 = identical)
      Mute Users: ${config.muteUsers}
      Delete Messages: ${config.deleteMessages}
      ${edit ? '' : `\nThe following attachment(s) show the difference between the image you posted (left)\
      (left) and the old image (right).`}`,
      "inline": true
    }
  }else{
    emb.fields = []
  }

  return emb
}

const reactWithSettings = (msg) => {
  if(config.devMode){
    msg.react('⬆️')
      .then(() => msg.react('⬇️'))
      .then(() => msg.react('🙊'))
      .then(() => msg.react('🗑️'))
      .then(() => msg.react('⚙️'))
  } else {
    msg.react('⚙️')
  }
}

client.on('message', msg => {

  if(msg.channel.type === 'dm'){
    console.log(`DM: ${msg.author.tag}: ${msg.cleanContent}`)
    return
  }

  if (msg.channel.id !== secrets.generalID) return
  if (msg.author === client.user) return
  if (msg.member && msg.member.hasPermission('KICK_MEMBERS')) return
  imageFetch(msg).then(result => {
    if(result.repost){

      if(config.deleteMessages) msg.delete()
    
      msg.reply({embed: getWarningEmbed(msg) }).then((herMsg) => {
        if(config.devMode) {
          const files = result.values.slice(0,10).map(v => new Discord.MessageAttachment(v.devPath));
          msg.reply({ files: files})
        }
        reactWithSettings(herMsg)
      })

    }
  })
})

client.on('messageReactionAdd', ((reaction, user) => {
  if (user === client.user || reaction.message.author !== client.user) return
  const member = reaction.message.channel.guild.members.cache.get(user.id)
  if (!member || !member.hasPermission('KICK_MEMBERS')) return

  reaction.message.reactions.removeAll()

  if(reaction.emoji.name === '⬆️') config.similarityValue += 0.005
  if(reaction.emoji.name === '⬇️') config.similarityValue -= 0.005
  if(reaction.emoji.name === '🙊') config.muteUsers = !config.muteUsers
  if(reaction.emoji.name === '🗑️') config.deleteMessages = !config.deleteMessages
  if(reaction.emoji.name === '⚙️') config.devMode = !config.devMode

  reaction.message.edit({embed: getWarningEmbed(reaction.message)})
  reactWithSettings(reaction.message)
}))

client.login(secrets.token)
