const Discord = require('discord.js')
const token = require('./token').token // Need a token.json with: { "token": "TOKEN HERE" }
const pokemon = require('./pokemon.json')
const raidPokemon = [ ...pokemon.level1, ...pokemon.level2, ...pokemon.level3, ...pokemon.level4, ...pokemon.legends ]
const pokemonExists = pokemon.pokemon.reduce((res, pokeName) => {
  res[pokeName] = true
  return res
}, {})
const pokeGroups =
  [ { name: 'Rares'
    , pokemon: pokemon.rares
    , code: 'rares'
    }
  , { name: 'Level 1 Raids'
    , pokemon: pokemon.level1
    , code: 'level1'
    }
  , { name: 'Level 2 Raids'
    , pokemon: pokemon.level2
    , code: 'level2'
    }
  , { name: 'Level 3 Raids'
    , pokemon: pokemon.level3
    , code: 'level3'
    }
  , { name: 'Level 4 Raids'
    , pokemon: pokemon.level4
    , code: 'level4'
    }
  , { name: 'Legendaries'
    , pokemon: pokemon.legends
    , code: 'legends'
    }
  ]
var stringSimilarity = require('string-similarity')
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
// - Watch/ignore all

bot.on('ready', () => console.log('PoGO Bot: Ready!'))

const sendHelp = ctx => {
  ctx.botChannel.send(
    `I'm the PokéBot. I'm helping manage the server.

**Subscribe to Pokemon Sightings**
On ${ctx.botChannel.toString()} channel
\`\`\`
.watch: get notified about certain Wild Pokemon
.ignore: stop notifications about certain Wild Pokemon and Raids
\`\`\`
On ${ctx.guild.channels.find('name', 'poke-spotting').toString()} channel
\`\`\`
.wild <pokemon> at <location>: share a Pokemon Sighting
\`\`\`

**Raids**
On ${ctx.botChannel.toString()} channel
\`\`\`
.watch: get notified about certain Raids
.ignore: stop notifications about certain Raids
.join: see a list of raid channels you can join
.join channel-name-here: enable the raid channel you previously left
\`\`\`
On a raid channel
\`\`\`
.raid <pokemon> at <gym> start <time>: announce a raid plan on a raid channel
.leave: leave the **raid channel** you are in
\`\`\`

**Other**
\`\`\`
.help: get this message sent to #bot
\`\`\`
`)
}

const notifyNoTeam = ctx => {
  if (!['help', 'join-team'].includes(ctx.channel.name)) return
  ctx.channel.send(
    `${ctx.guild.roles.find('name', DEFAULT_ROLE)}: please post a screenshot of your profile here to get a team assigned which will get you access to team-specific channels and help with coordinating raids. Thanks!`
  )
  ctx.message.delete()
}

const leaveRaidChannel = ctx => {
  // Block when trying to leave other channels:
  if (!ctx.channel.name.startsWith(RAID_CHANNEL_PREFIX)) {
    ctx.channel.send(
      `${ctx.message.member.toString()}, you can only leave **raid channels**. This is not a raid channel, sorry!`
    )
    return
  }
  const noRaidName = `not-${ctx.channel.name.slice(RAID_CHANNEL_PREFIX.length)}`
  const noRaidRole = ctx.guild.roles.find('name', noRaidName)

  // This creates the role if no one has ever left this particular channel.
  if (!noRaidRole) {
    // Make the new role
    ctx.guild.createRole(
      { name: noRaidName
      , mentionable: false
      }
    ).then(role => {
      // Assign it to the leaver
      ctx.message.member.addRole(role)
      // Make permissions for this role so that they can't read the channel anymore.
      return ctx.channel.overwritePermissions(
        role,
        { 'READ_MESSAGES': false }
      )
    }).then(() => ctx.message.delete()) // Delete the leave message
  } else {
    // Add the role
    ctx.message.member.addRole(noRaidRole).then(
      () => ctx.message.delete() // Delete the leave message
    )
  }
}

const joinRaidChannel = ctx => {
  // If they don't specify a parameter, then we spit out a helpful message.
  if (ctx.content.indexOf(' ') === -1) {
    const optedOut =
      ctx.message.member.roles
        .filter(role => role.name.indexOf('not-') === 0)
        .filter(role => {
          console.log(`${RAID_CHANNEL_PREFIX}${role.name.slice('not-'.length)}`)
          return !!ctx.guild.channels.find('name', `${RAID_CHANNEL_PREFIX}${role.name.slice('not-'.length)}`)
        })
        console.log(
          ctx.message.member.roles
            .filter(role => role.name.indexOf('not-') === 0).array()
        )
    console.log(optedOut.array())
    const reply = !optedOut.array().length ? `${ctx.message.member.toString()}, you are already in all raid channels.` :
      `${ctx.message.member.toString()}, these are the raid channels you can rejoin:

${optedOut
.map(role => `- ${role.name.slice('not-'.length)}`)
.join('\n')
}

Just say: \`.join channel-name-here\``
    ctx.message.channel.send(reply)
    return
  }
  let targetChannel = (ctx.content.split(' ') || [ '', '' ])[1]
  if (targetChannel.indexOf(RAID_CHANNEL_PREFIX) !== 0) {
    targetChannel = `${RAID_CHANNEL_PREFIX}${targetChannel}`
  }
  const noRaidName = `not-${targetChannel.slice(RAID_CHANNEL_PREFIX.length)}`
  const channelToGet = ctx.message.guild.channels.find('name', targetChannel)
  if (!channelToGet) {
    ctx.message.channel.send(
      `${ctx.message.member.toString()}, I don't think that #${targetChannel} exists.`
    )
    return
  }
  const removableRole = ctx.message.guild.roles.find('name', noRaidName)
  if (removableRole) {
    ctx.message.member.removeRole(removableRole).then(() => {
      ctx.message.channel.send(
        `${ctx.message.member.toString()}, you should have access to ${channelToGet.toString()} now.`
      )
    })
  }
}

const assignNoTeam = ctx => {
  const teamRoles = [INSTINCT, VALOR, MYSTIC, DEFAULT_ROLE]
  const noTeamRole = ctx.guild.roles.find('name', DEFAULT_ROLE)
  let added = 0
  const members = ctx.guild.members.array()
  const addMembers = remainingMembers => {
    if (!remainingMembers.length) {
      ctx.channel.send(`Added ${added} users to the "no-team" role.`)
      return
    }
    const member = remainingMembers.pop()
    const roles = member.roles.array()
    if (!roles.some(role => teamRoles.includes(role.name))) {
      return member.addRole(noTeamRole).then(() => {
        added += 1
        return addMembers(remainingMembers)
      })
    } else {
      return addMembers(remainingMembers)
    }
  }
  addMembers(members)
}

const getPokemonRole = (ctx, targetPokemon) => {
  const pokeRoleName = `${targetPokemon}`
  const pokeRole = ctx.guild.roles.find('name', pokeRoleName)

  // This creates the role if no one has ever left this particular channel.
  return Promise.resolve(
    pokeRole || ctx.guild.createRole(
      { name: pokeRoleName
      , mentionable: false
      }
    )
  )
}

const matchPokemon = (userPokemon, raidOnly = false) => {
  const pool = raidOnly ? raidPokemon : pokemon.pokemon
  // Allow mapping of TTar -> Tyranitar
  const poolWithAliases =
    [...pool, ...Object.keys(pokemon.aliases.pokemon)]
  const pokeMatch = stringSimilarity.findBestMatch(userPokemon, poolWithAliases).bestMatch
  if (pokeMatch.rating < 0.6) {
    return false
  }
  const resultingPokemon =
    pokemon.aliases.pokemon[pokeMatch.target] || pokeMatch.target
  return resultingPokemon
}

const matchGroup = userInput => {
  const groupsWithAliases =
    [...pokeGroups.map(group => group.code), ...Object.keys(pokemon.aliases.groups)]
  const groupMatch = stringSimilarity.findBestMatch(userInput, groupsWithAliases).bestMatch
  if (groupMatch.rating < 0.6) {
    return false
  }

  const resultingGroup =
    pokemon.aliases.groups[groupMatch.target] || groupMatch.target
  return pokeGroups.find(group => group.code === resultingGroup)
}

const stop = ctx => {
  ctx.channel.send(
    `I'm sorry ${ctx.message.member.toString()}, I'm afraid I can't do that.`
  )
}

const hi = ctx => {
  ctx.channel.send('...yo')
}

const watch = ctx => {
  if (ctx.channel.name !== 'bot') {
    return ctx.channel.send(`Please post in ${ctx.botChannel.toString()}`)
  }
  if (!ctx.params) {
    // Tell user what they can watch.
    let watchMessage = ''
    watchMessage += 'You can watch for Pokemon to get notified on sightings and raids.\n'
    pokeGroups.forEach(group => {
      // **Group Name** - `.watch code`
      // [pokemon]
      //
      watchMessage += `**${group.name}** - \`.watch ${group.code}\`\n`
      watchMessage += group.pokemon.join(', ') + '\n\n'
    })
    watchMessage += 'Or `.watch Pokemon` to watch a individual Pokemon, e.g. `.watch Mareep Flaffy Ampharos`'
    return ctx.channel.send(watchMessage)
  }
  const rolesToAdd = []
  ctx.params.split(' ').filter(x => x).forEach(watchable => {
    const group = matchGroup(watchable)
    if (group) {
      group.pokemon.map(poke =>
        rolesToAdd.push(getPokemonRole(ctx, poke))
      )
    } else {
      const targetPokemon = matchPokemon(watchable)
      if (!targetPokemon) {
        ctx.channel.send(
          `${ctx.message.member.toString()}: I don't recognize ${watchable} as a Pokemon or group.`
        )
      } else {
        rolesToAdd.push(
          getPokemonRole(ctx, targetPokemon)
        )
      }
    }
  })

  const userRoles = ctx.message.member.roles
  if (rolesToAdd.length) {
    Promise.all(rolesToAdd).then(roles => {
      const newRoles =
        // Remove duplicates, then filter out already assigned ones.
        [...new Set(roles)].filter(role => !userRoles.has(role.id))

      ctx.message.member.addRoles(newRoles).then(() => {
        ctx.channel.send(`${ctx.message.member.toString()
        }: you are now watching for ${roles.map(role => role.name).join(', ')}.`)
      }
      )
    })
  }
}
const ignore = ctx => {
  if (ctx.channel.name !== 'bot') {
    return ctx.channel.send(`Please post in ${ctx.botChannel.toString()}`)
  }
  if (!ctx.params) {
    // Tell user what they can ignore
    return ctx.channel.send(`${ctx.message.member.toString()
    }: you can unsubscribe from any watchable group, or from any of the Pokemon you are watching.

Right now you are watching ${
  ctx.message.member.roles.array()
    .map(role => role.name)
    .filter(role => pokemonExists[role])
    .join(', ')}`)
  }
  const rolesToRemove = []
  ctx.params.split(' ').filter(x => x).forEach(watchable => {
    const group = matchGroup(watchable)
    if (group) {
      group.pokemon.map(poke =>
        rolesToRemove.push(getPokemonRole(ctx, poke))
      )
    } else {
      const targetPokemon = matchPokemon(watchable)
      if (!targetPokemon) {
        ctx.channel.send(
          `${ctx.message.member.toString()}: I don't recognize ${watchable} as a Pokemon or group.`
        )
      } else {
        rolesToRemove.push(
          getPokemonRole(ctx, targetPokemon)
        )
      }
    }
  })
  if (rolesToRemove.length) {
    Promise.all(rolesToRemove).then(roles =>
      ctx.message.member.removeRoles(roles).then(() => {
        ctx.channel.send(`${ctx.message.member.toString()
        }: you are no longer watching ${roles.map(role => role.name).join(', ')}.`)
      }
    ))
  }
}
const raid = ctx => {
  if (!ctx.channel.name.startsWith('raid')) {
    return ctx.channel.send('Please post raid plans in a raid channel.')
  }
  if (!ctx.params || ctx.params.split(' ').length === 1) {
    // Tell user how to announce wild spawn
    return ctx.channel.send(
      `Use the raid command to announce a raid plan. \`.raid <pokemon> at <location> start <time>\`, e.g. \`.raid Magikarp at Marble Artichoke start 16:50\`

**Only announce once per raid group, try to discuss with others online before proposing a start time.** You can also mention the number of people interested so far.`
    )
  }
  const raidPokemon = ctx.params.split(' ')[0]
  const targetPokemon = matchPokemon(raidPokemon, true)
  if (!targetPokemon) {
    return ctx.channel.send(
      `${ctx.message.member.toString()}: I don't think that's a raid Pokemon? :thinking:`
    )
  } else {
    // Get the Pokemon's role
    getPokemonRole(ctx, targetPokemon).then(role =>
      // Make it mentionable
      role.setMentionable(true)
    ).then(role =>
      // Mention it and notify raid
      ctx.channel.send(
        `${
          role.toString()
        } raid ${
          ctx.params.split(' ').slice(1).join(' ')
        }! **React with Pokeball to show interest.**`
      // Remove mentionability again
      ).then(message => {
        const pokeballEmoji = ctx.guild.emojis.find('name', 'pokeball')
        message.react(pokeballEmoji)
        role.setMentionable(false)
      })
    )
  }
}
const wild = ctx => {
  const helpString =
    'To announce a wild Pokemon, please use the format: `.wild <pokemon> at <location>`, e.g. `.wild Eevee at Bank and Slater`'
  if (ctx.channel.name !== 'poke-spotting') {
    return ctx.channel.send(`Please post in ${ctx.guild.channels.find('name', 'poke-spotting').toString()}

${helpString}`)
  }
  if (!ctx.params || ctx.params.split(' ').length === 1) {
    // Tell user how to announce wild spawn
    return ctx.channel.send(helpString)
  }
  const wildPokemon = ctx.params.split(' ')[0]
  const targetPokemon = matchPokemon(wildPokemon)
  if (!targetPokemon) {
    return ctx.channel.send(
      `${ctx.message.member.toString()}: I don't know that Pokemon :thinking:`
    )
  } else {
    // Get the Pokemon's role
    getPokemonRole(ctx, targetPokemon).then(role =>
      // Make it mentionable
      role.setMentionable(true)
    ).then(role =>
      // Mention it and notify wild
      ctx.channel.send(
        `A Wild ${
          role.toString()
        } has appeared ${
          ctx.params.split(' ').slice(1).join(' ')
        }!`
      // Remove mentionability again
      ).then(() => role.setMentionable(false))
    )
  }
}

bot.on('message', message => {
  try {
    // No DM support!
    if (message.channel.type === 'dm') {
      message.channel.send('I only work on the #bot channel, not through DMs.')
      return
    }

    const ctx =
      { message: message
      , guild: message.guild
      , botChannel: message.guild.channels.find('name', 'bot')
      , content: message.content
      , channel: message.channel
      , isCommand: message.content.startsWith(PREFIX)
      , command: (message.content.match(/^\.(\w+)/) || [null, null])[1]
      , params: message.content.split(' ').slice(1).join(' ')
      }
    if (!ctx.isCommand) return
    switch (ctx.command) {
      case 'help':
        sendHelp(ctx)
        break
      case 'no-team':
        notifyNoTeam(ctx)
        break
      case 'leave':
        leaveRaidChannel(ctx)
        break
      case 'join':
        joinRaidChannel(ctx)
        break
      case 'assign-no-team':
        assignNoTeam(ctx)
        break
      case 'watch':
        watch(ctx)
        break
      case 'ignore':
        ignore(ctx)
        break
      case 'raid':
        raid(ctx)
        break
      case 'wild':
        wild(ctx)
        break
      case 'migrate':
        migrate(ctx)
        break
      case 'stop':
        stop(ctx)
        break
      case 'hi':
        hi(ctx)
        break
    }
  } catch (e) {
    console.log('Something went wrong while handling a message.')
    console.log(e)
  }
})

// Assign default role to new members
bot.on('guildMemberAdd', member => {
  member.addRole(member.guild.roles.find('name', DEFAULT_ROLE))
})

bot.on('messageReactionAdd', (reaction, user) => {
  const guild = reaction.message.guild
  const reactedWith = reaction.emoji.name
  const channel = reaction.message.channel.name
  if (channel === 'poke-spotting') {
    // Control watched Pokemon with reactions
    reaction.message.guild.fetchMember(user).then(reacter => {
      // TODO
    })
  } else {
    // Team assignment with reactions
    const moderatorRole = guild.roles.find('name', MODERATOR)
    const noTeamRole = guild.roles.find('name', DEFAULT_ROLE)
    const instinctRole = guild.roles.find('name', INSTINCT)
    const mysticRole = guild.roles.find('name', MYSTIC)
    const valorRole = guild.roles.find('name', VALOR)
    reaction.message.guild.fetchMember(user).then(reacter => {
      const isModerator = reacter.roles.has(moderatorRole.id)

      const sender = reaction.message.member
      if (!isModerator ||
          !['help', 'join-team'].includes(channel) ||
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
  }
})

// Initialize
bot.login(token)
