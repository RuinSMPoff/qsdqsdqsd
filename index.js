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

// --- Anti-idle par mouvement réel ---
let moveState = 'walk' // 'walk' ou 'jump'
let stateStartTime = Date.now()
let walkDirection = 1 // 1 ou -1, pour faire des allers-retours
let tickCounter = 0

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
            actualPosition = { ...packet.player_position }
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

        // Démarrer l'anti-idle après 2 secondes
        setTimeout(() => {
            startAntiIdleMovement()
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
        stopAntiIdleMovement()
        reconnect()
    })

    client.on('close', () => {
        console.log('Connexion fermée')
        connected = 0
        if (tickInterval) clearInterval(tickInterval)
        stopAntiIdleMovement()
        reconnect()
    })

    client.on('kick', (packet) => {
        console.log('Kické par le serveur:', JSON.stringify(packet, null, 2))
    })
}

// Fonction anti-idle : alterne marche (5s) et saut (~0.8s)
function startAntiIdleMovement() {
    if (clickInterval) {
        clearInterval(clickInterval)
    }

    console.log('========================================')
    console.log('🚶 DÉMARRAGE ANTI-IDLE (marche + saut)')
    console.log('========================================')

    moveState = 'walk'
    stateStartTime = Date.now()
    clickCount = 0

    clickInterval = setInterval(() => {
        if (!client || entityRuntimeId === null) return

        try {
            const now = Date.now()
            const elapsed = now - stateStartTime

            // Transition d'état
            if (moveState === 'walk' && elapsed > 5000) {
                moveState = 'jump'
                stateStartTime = now
                walkDirection *= -1 // repart dans l'autre sens la prochaine fois
            } else if (moveState === 'jump' && elapsed > 800) {
                moveState = 'walk'
                stateStartTime = now
            }

            let onGround = true

            if (moveState === 'walk') {
                // Petit pas dans la direction courante
                const speed = 0.13 // blocs par tick (~150ms d'intervalle ici)
                const yaw = spawnRotation.yaw || 0
                const rad = (yaw * Math.PI) / 180
                actualPosition.x += -Math.sin(rad) * speed * walkDirection
                actualPosition.z += -Math.cos(rad) * speed * walkDirection
            } else {
                // Phase de saut : monte puis redescend
                const jumpElapsed = elapsed
                if (jumpElapsed < 400) {
                    actualPosition.y += 0.08
                    onGround = false
                } else {
                    actualPosition.y -= 0.08
                    onGround = jumpElapsed > 700
                }
            }

            tickCounter++

            client.queue('move_player', {
                runtime_id: BigInt(entityRuntimeId),
                position: actualPosition,
                pitch: spawnRotation.pitch || 0,
                yaw: spawnRotation.yaw || 0,
                head_yaw: spawnRotation.headYaw || spawnRotation.yaw || 0,
                mode: 'normal',
                on_ground: onGround,
                ridden_runtime_id: BigInt(0),
                tick: BigInt(tickCounter)
            })

            clickCount++
            if (clickCount % 50 === 0) {
                console.log(`[${clickCount}] ✅ Mouvement envoyé (${moveState}) - pos: ${actualPosition.x.toFixed(2)}, ${actualPosition.y.toFixed(2)}, ${actualPosition.z.toFixed(2)}`)
            }
        } catch (error) {
            console.error('❌ Erreur lors du mouvement:', error.message)
        }
    }, 150)
}

function stopAntiIdleMovement() {
    if (clickInterval) {
        clearInterval(clickInterval)
        clickInterval = null
        console.log('⏹️ Anti-idle arrêté')
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
    console.log('Reconnexion dans 15 secondes...')
    setTimeout(() => {
        reconnecting = false
        stopAntiIdleMovement()
        startBot()
    }, 15000) // 15s pour laisser le temps au serveur de nettoyer l'ancienne session
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
    <br><br>Position: ${actualPosition.x.toFixed(2)}, ${actualPosition.y.toFixed(2)}, ${actualPosition.z.toFixed(2)}
    <br><br>Status: ${clickInterval ? '🟢 Anti-idle actif (' + moveState + ')' : '🔴 Inactif'}
    <br><br>Mouvements envoyés: ${clickCount}
    <br><br>Made By <b>https://github.com/healer-op/AternosAfkBot</b>`)
})

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
    console.log('MADE BY HEALER')
    console.log('✅ Bot prêt - Anti-idle (marche + saut) actif !')
})
