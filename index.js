const Discord = require('discord.js')
const token = require('./token').token // Need a token.json with: { "token": "TOKEN HERE" }

const bot = new Discord.Client()

const PREFIX = '.'
const DEFAULT_ROLE = 'no-team'
const INSTINCT = 'teaminstinct'
const VALOR = 'teamvalor'
const MYSTIC = 'teammystic'
const MODERATOR = 'mods'
const RAID_CHANNEL_PREFIX = 'raids-'

// Ideas:
// - Add gym search

bot.on('ready', () => {
  console.log('PoGO Bot: Ready!')
})

bot.on('message', message => {
  try {
    const guild = message.guild
    const content = message.content
    const channel = message.channel.name
    if (content.indexOf(`${PREFIX}help`) === 0) {
      message.channel.send(
        `${message.member.toString()}, I am PMing you my commands.`
      )
      message.member.send(
        `I'm the PokéBot. I'm helping manage the server.

- \`.leave\`   -   leave the raid channel you are in
- \`.join\`   -   see a list of raid channels you can join (in #help)
- \`.join channel-name-here\`   -   enable the raid channel you previously left
- \`.help\`   -   get this message sent to you
`)
    } else if (content.indexOf(`${PREFIX}no-team`) === 0) {
      if (message.channel.name !== 'help') return
      message.channel.send(
        `${message.guild.roles.find('name', DEFAULT_ROLE)}: please post a screenshot of your profile here to get a team assigned which will get you access to team-specific channels and help with coordinating raids. Thanks!`
      )
      message.delete()
    } else if (content.indexOf(`${PREFIX}leave`) === 0) {
      if (channel.indexOf(RAID_CHANNEL_PREFIX) !== 0) {
        message.channel.send(
          `${message.member.toString()}, you can only leave a raid channel from within it!`
        )
        return
      }
      const noRaidName = `not-${channel.slice(RAID_CHANNEL_PREFIX.length)}`
      const noRaidRole = guild.roles.find('name', noRaidName)
      console.log('noRaidRole', noRaidRole)
      if (!noRaidRole) {
        guild.createRole(
          { name: noRaidName
          , mentionable: false
          }
        ).then(role => {
          message.member.addRole(role)
          return message.channel.overwritePermissions(
            role,
            { 'READ_MESSAGES': false }
          )
        }).then(() => message.delete())
      } else {
        message.member.addRole(noRaidRole).then(
          () => message.delete()
        )
      }
    } else if (content.indexOf(`${PREFIX}join`) === 0) {
      if (content.indexOf(' ') === -1) {
        const optedOut =
          message.member.roles
            .filter(role => role.name.indexOf('not-') === 0)
            .filter(role => {
              console.log(`${RAID_CHANNEL_PREFIX}${role.name.slice('not-'.length)}`)
              return !!guild.channels.find('name', `${RAID_CHANNEL_PREFIX}${role.name.slice('not-'.length)}`)
            })
            console.log(
            message.member.roles
              .filter(role => role.name.indexOf('not-') === 0).array()
            )
        console.log(optedOut.array())
        const reply = !optedOut.array().length ? `${message.member.toString()}, you are already in all raid channels.` :
          `${message.member.toString()}, these are the raid channels you can rejoin:

${optedOut
    .map(role => `- ${role.name.slice('not-'.length)}`)
    .join('\n')
}

Just say: \`.join channel-name-here\``
        console.log(reply)
        message.channel.send(reply)
        return
      }
      let targetChannel = (content.split(' ') || [ '', '' ])[1]
      console.log('joining?', targetChannel)
      if (targetChannel.indexOf(RAID_CHANNEL_PREFIX) !== 0) {
        targetChannel = `${RAID_CHANNEL_PREFIX}${targetChannel}`
      }
      const noRaidName = `not-${targetChannel.slice(RAID_CHANNEL_PREFIX.length)}`
      const channelToGet = message.guild.channels.find('name', targetChannel)
      if (!channelToGet) {
        message.channel.send(
          `${message.member.toString()}, I don't think that #${targetChannel} exists.`
        )
        return
      }
      const removableRole = message.guild.roles.find('name', noRaidName)
      if (removableRole) {
        message.member.removeRole(removableRole).then(() => {
          message.channel.send(
            `${message.member.toString()}, you should have access to ${channelToGet.toString()} now.`
          )
        })
      }
    }
  } catch (e) {
    console.log('Something went wrong while handling a message.')
    console.err(e)
  }
})

bot.on('guildMemberAdd', member => {
  member.addRole(member.guild.roles.find('name', DEFAULT_ROLE))
})

bot.on('messageReactionAdd', (reaction, user) => {
  const guild = reaction.message.guild
  const reactedWith = reaction.emoji.name
  const moderatorRole = guild.roles.find('name', MODERATOR)
  const noTeamRole = guild.roles.find('name', DEFAULT_ROLE)
  const instinctRole = guild.roles.find('name', INSTINCT)
  const mysticRole = guild.roles.find('name', MYSTIC)
  const valorRole = guild.roles.find('name', VALOR)
  reaction.message.guild.fetchMember(user).then(reacter => {
    const isModerator = reacter.roles.has(moderatorRole.id)
    const channel = reaction.message.channel.name
    const sender = reaction.message.member
    if (channel !== 'help' ||
        ['instinct', 'mystic', 'valor'].every(teamReaction => teamReaction !== reactedWith)
      ) {
      return
    }
    sender.removeRoles([noTeamRole, valorRole, instinctRole, mysticRole]).then(() => {
      switch (reactedWith) {
        case 'instinct':
          sender.addRole(instinctRole)
          break
        case 'mystic':
          sender.addRole(mysticRole)
          break
        case 'valor':
          sender.addRole(valorRole)
          break
      }
      reaction.message.channel.send(
        `${sender.toString()}, welcome to Team ${reactedWith[0].toUpperCase()}${reactedWith.slice(1)}!`
      )
    })
  })
})

bot.login(token)
