const bedrock = require('bedrock-protocol')
const fs = require('fs')
const express = require('express')

let rawdata = fs.readFileSync('config.json')
let data = JSON.parse(rawdata)

var host = data["ip"]
var username = data["name"]
var connected = 0
var reconnecting = false

let popularity = 0

let client
let tickInterval = null
let entityRuntimeId = null
let spawnPosition = { x: 0, y: 69, z: 0 }
let spawnRotation = { pitch: 0, yaw: 0, headYaw: 0 }
let actualPosition = { x: 0, y: 69, z: 0 }

let clickInterval = null
let clickCount = 0

function startBot() {
    client = bedrock.createClient({
        host: host,
        port: data["port"],
        username: username,
        offline: false,
        auth: 'microsoft'
    })

    client.on('join', () => {
        console.log('Connecté au serveur Bedrock')
        connected = 1
    })

    client.on('start_game', (packet) => {
        entityRuntimeId = packet.runtime_entity_id
        if (packet.player_position) {
            spawnPosition = packet.player_position
            actualPosition = packet.player_position
            console.log('Position de spawn reçue:', spawnPosition)
        }
        if (typeof packet.rotation !== 'undefined') {
            spawnRotation.pitch = packet.rotation.x || 0
            spawnRotation.yaw = packet.rotation.y || 0
            spawnRotation.headYaw = packet.rotation.y || 0
        }
    })

    client.on('spawn', () => {
        console.log('Bot spawn dans le monde')
        console.log(`Position actuelle: ${actualPosition.x}, ${actualPosition.y}, ${actualPosition.z}`)

        if (entityRuntimeId !== null) {
            client.queue('set_local_player_as_initialized', {
                runtime_entity_id: entityRuntimeId
            })
            console.log('set_local_player_as_initialized envoyé')
        }

        sendChat('hello')
        
        // Démarrer le spam de clics après 2 secondes
        setTimeout(() => {
            startSpamClick()
        }, 2000)
    })

    client.on('text', (packet) => {
        if (packet.type === 'chat') {
            console.log(`${packet.source_name}: ${packet.message}`)

            if (packet.message === `Hi ${username}` || packet.message === `hi ${username}`) {
                popularity++
                sendChat(`hi ${packet.source_name}`)
            }

            if (packet.message === `${username} help` || packet.message === `help ${username}`) {
                sendChat(`Commandes: Hi ${username}`)
                sendChat(`Made by https://github.com/healer-op/AternosAfkBot`)
            }
        }
    })

    client.on('error', (err) => {
        console.log('Erreur client:', err.message)
    })

    client.on('disconnect', (packet) => {
        console.log('Déconnecté')
        connected = 0
        if (tickInterval) clearInterval(tickInterval)
        if (clickInterval) clearInterval(clickInterval)
        reconnect()
    })

    client.on('close', () => {
        console.log('Connexion fermée')
        connected = 0
        if (tickInterval) clearInterval(tickInterval)
        if (clickInterval) clearInterval(clickInterval)
        reconnect()
    })

    client.on('kick', (packet) => {
        console.log('Kické par le serveur:', JSON.stringify(packet, null, 2))
    })
}

// Fonction pour spammer le click droit (interaction)
// Fonction pour éviter l'idle timeout : saut périodique (action valide du protocole)
function startSpamClick() {
    if (clickInterval) {
        clearInterval(clickInterval)
    }

    console.log('========================================')
    console.log('🚀 DÉMARRAGE ANTI-IDLE (saut périodique)')
    console.log('========================================')

    clickCount = 0

    clickInterval = setInterval(() => {
        if (!client || entityRuntimeId === null) return

        try {
            // 'jump' est une action VALIDE de l'enum player_action
            client.queue('player_action', {
                runtime_entity_id: entityRuntimeId,
                action: 'jump',
                position: actualPosition,
                result_position: actualPosition,
                data: 0
            })

            clickCount++

            if (clickCount % 50 === 0) {
                console.log(`[${clickCount}] ✅ Saut envoyé (anti-idle actif)`)
            }
        } catch (error) {
            console.error('❌ Erreur lors du saut:', error.message)
        }
    }, 3000) // toutes les 3s, largement suffisant pour reset l'idle timer
}

// Fonction pour arrêter le spam
function stopSpamClick() {
    if (clickInterval) {
        clearInterval(clickInterval)
        clickInterval = null
        console.log('⏹️ Spam de clics arrêté')
    }
}

function sendChat(message) {
    if (!client) return
    client.write('text', {
        type: 'chat',
        needs_translation: false,
        source_name: username,
        xuid: '',
        platform_chat_id: '',
        filtered_message: '',
        message: message
    })
}

function reconnect() {
    if (reconnecting) return
    reconnecting = true
    console.log('Reconnexion dans 5 secondes...')
    setTimeout(() => {
        reconnecting = false
        stopSpamClick()
        startBot()
    }, 5000)
}

process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection:', err.message)
})

startBot()

// --- Express ---
const port = process.env.PORT || 3000
const app = express()

app.get('/', (req, res) => {
    res.send(`<b>${username}</b> is Online At <b>${host}</b>
    <br><br>Connected: <b>${connected ? 'Yes' : 'No'}</b>
    <br><br>Popularity Counter <b>${popularity}</b>
    <br><br>Position: ${actualPosition.x}, ${actualPosition.y}, ${actualPosition.z}
    <br><br>Status: ${clickInterval ? '🟢 Spam de clics actif' : '🔴 Inactif'}
    <br><br>Clics envoyés: ${clickCount}
    <br><br>Made By <b>https://github.com/healer-op/AternosAfkBot</b>`)
})

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
    console.log('MADE BY HEALER')
    console.log('✅ Bot prêt - Spam de click droit actif !')
})
