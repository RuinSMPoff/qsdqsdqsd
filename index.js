const mineflayer = require('mineflayer')
const pvp = require('mineflayer-pvp').plugin
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const armorManager = require('mineflayer-armor-manager')
const fs = require('fs')
const express = require('express')

let rawdata = fs.readFileSync('config.json')
let data = JSON.parse(rawdata)

const host = data['ip']
const botPort = data['port']
const username = data['name']
const nightSkip = data['auto-night-skip'] === 'true'
const loginEnabled = data['login-enabled'] === 'true'

// --- État global ---
let connected = 0
let death = 0
let popularity = 0
let pvpCount = 0
let reconnecting = false
let bot = null

// --- Anti-idle ---
const actions = ['forward', 'back', 'left', 'right']
let moveInterval = 2      // secondes minimum entre 2 actions
let maxRandomAdd = 5      // secondes aléatoires en plus
let lastActionTime = -1
let moving = false
let lastAction = null

function createBot() {
bot = mineflayer.createBot({
    host: host,
    port: botPort,
    username: username,
    version: "1.21.4",
    logErrors: false
})

    bot.loadPlugin(pvp)
    bot.loadPlugin(armorManager)
    bot.loadPlugin(pathfinder)

    registerEvents()
}

function registerEvents() {
    bot.on('login', () => {
        console.log('Connexion en cours...')

        if (loginEnabled) {
            bot.chat(data['login-cmd'])
            setTimeout(() => {
                bot.chat(data['register-cmd'])
            }, 2000)
        }
    })

    bot.on('spawn', () => {
        connected = 1
        console.log('Bot spawn dans le monde')
        bot.chat('hello')
        startPromoLoop()
    })

    bot.on('physicTick', () => {
        handleAntiIdle()
        handleLookAt()
        handleGuard()
    })

    bot.on('death', () => {
        death++
        console.log('Le bot est mort, respawn automatique par le serveur')
    })

    bot.on('end', (reason) => {
        console.log('Connexion terminée:', reason)
        connected = 0
        reconnect()
    })

    bot.on('kicked', (reason) => {
        console.log('Kické par le serveur:', reason)
        connected = 0
    })

    bot.on('error', (err) => {
        console.log('Erreur bot:', err.message)
    })

    bot.on('playerCollect', (collector) => {
        if (collector !== bot.entity) return
        setTimeout(() => {
            const sword = bot.inventory.items().find(item => item.name.includes('sword'))
            if (sword) bot.equip(sword, 'hand').catch(() => {})
        }, 150)
        setTimeout(() => {
            const shield = bot.inventory.items().find(item => item.name.includes('shield'))
            if (shield) bot.equip(shield, 'off-hand').catch(() => {})
        }, 250)
    })

    bot.on('stoppedAttacking', () => {
        if (guardPos) moveToGuardPos()
    })

    bot.on('chat', (senderUsername, message) => {
        if (senderUsername === bot.username) return
        handleChatCommands(senderUsername, message)
    })

    bot.on('time', () => {
        if (!nightSkip) return
        if (bot.time.timeOfDay >= 13000) {
            bot.chat('/time set day')
        }
    })
}

// --- Anti-idle : marche aléatoire pour éviter le kick AFK ---
function handleAntiIdle() {
    if (connected < 1) return
    if (!bot.time) return

    if (lastActionTime < 0) {
        lastActionTime = bot.time.age
        return
    }

    const randomAdd = Math.random() * maxRandomAdd * 20
    const interval = moveInterval * 20 + randomAdd

    if (bot.time.age - lastActionTime > interval) {
        if (moving) {
            bot.setControlState(lastAction, false)
            moving = false
        } else {
            const yaw = Math.random() * Math.PI - Math.PI / 2
            const pitch = Math.random() * Math.PI - Math.PI / 2
            bot.look(yaw, pitch, false)
            lastAction = actions[Math.floor(Math.random() * actions.length)]
            bot.setControlState(lastAction, true)
            moving = true
        }
        lastActionTime = bot.time.age
    }
}

// Regarde l'entité la plus proche quand il ne fait rien d'autre
function handleLookAt() {
    if (bot.pvp.target) return
    if (bot.pathfinder.isMoving()) return

    const entity = bot.nearestEntity()
    if (entity) bot.lookAt(entity.position.offset(0, entity.height, 0))
}

// --- Garde une zone et attaque les mobs proches ---
let guardPos = null

function guardArea(pos) {
    guardPos = pos.clone()
    if (!bot.pvp.target) moveToGuardPos()
}

function stopGuarding() {
    guardPos = null
    bot.pvp.stop()
    bot.pathfinder.setGoal(null)
}

function moveToGuardPos() {
    const mcData = require('minecraft-data')(bot.version)
    bot.pathfinder.setMovements(new Movements(bot, mcData))
    bot.pathfinder.setGoal(new goals.GoalBlock(guardPos.x, guardPos.y, guardPos.z))
}

function handleGuard() {
    if (!guardPos) return
    const filter = e => e.type === 'mob' &&
        e.position.distanceTo(bot.entity.position) < 16 &&
        e.mobType !== 'Armor Stand'
    const entity = bot.nearestEntity(filter)
    if (entity) bot.pvp.attack(entity)
}

// --- Commandes chat ---
function handleChatCommands(senderUsername, message) {
    const name = bot.username

    if (message.toLowerCase() === `hi ${name}`.toLowerCase() ||
        message.toLowerCase() === `hello ${name}`.toLowerCase()) {
        popularity++
        bot.chat(`hi ${senderUsername}`)
        return
    }

    if (message.toLowerCase() === `${name} help`.toLowerCase()) {
        bot.chat(`Commandes disponibles pour ${senderUsername}:`)
        bot.chat(`- hi ${name}`)
        bot.chat(`- guard ${name}`)
        bot.chat(`- fight me ${name}`)
        bot.chat(`- stop`)
        return
    }

    if (message.toLowerCase() === `guard ${name}`.toLowerCase()) {
        const player = bot.players[senderUsername]
        if (!player || !player.entity) {
            bot.chat(`Je ne te vois pas, ${senderUsername}`)
            return
        }
        bot.chat(`Je garde cette zone, ${senderUsername}`)
        guardArea(player.entity.position)
        return
    }

    if (message.toLowerCase() === `fight me ${name}`.toLowerCase()) {
        const player = bot.players[senderUsername]
        if (!player || !player.entity) {
            bot.chat(`Je ne te vois pas, ${senderUsername}`)
            return
        }
        bot.chat(`Prépare-toi, ${senderUsername}`)
        pvpCount++
        bot.pvp.attack(player.entity)
        return
    }

    if (message.toLowerCase() === 'stop') {
        bot.chat('Je ne garde plus cette zone')
        stopGuarding()
    }
}

// --- Message promo toutes les heures, 10 fois max ---
function startPromoLoop() {
    for (let i = 1; i <= 10; i++) {
        setTimeout(() => {
            if (connected) bot.chat('AntiAFK bot - https://github.com/healer-op/AternosAfkBot')
        }, 3600000 * i)
    }
}

// --- Reconnexion automatique ---
function reconnect() {
    if (reconnecting) return
    reconnecting = true
    console.log('Reconnexion dans 10 secondes...')
    setTimeout(() => {
        reconnecting = false
        createBot()
    }, 10000)
}

process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err.message)
})

createBot()

// --- Serveur web de statut ---
const port = process.env.PORT || 3000
const app = express()

app.get('/', (req, res) => {
    res.send(`<b>${username}</b> is Online At <b>${host}</b>
    <br><br>Connected: <b>${connected ? 'Yes' : 'No'}</b>
    <br><br>Death Counter: <b>${death}</b>
    <br><br>Popularity Counter: <b>${popularity}</b>
    <br><br>PvP Counter: <b>${pvpCount}</b>
    <br><br>Made By <b>https://github.com/healer-op/AternosAfkBot</b>`)
})

app.listen(port, () => {
    console.log(`Status page listening at http://localhost:${port}`)
})
