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
function startSpamClick() {
    if (clickInterval) {
        clearInterval(clickInterval)
    }
    
    console.log('========================================')
    console.log('🚀 DÉMARRAGE DU SPAM DE CLIC DROIT')
    console.log(`📌 Position actuelle: ${actualPosition.x}, ${actualPosition.y}, ${actualPosition.z}`)
    console.log('🔄 Le bot clique toutes les 100ms')
    console.log('========================================')
    
    clickCount = 0
    
    clickInterval = setInterval(() => {
        if (!client || !entityRuntimeId) return
        
        // Utiliser la position actuelle du joueur
        const pos = actualPosition
        
        try {
            // Envoyer un click droit sur le bloc devant le joueur
            // Calculer la direction devant le joueur
            const yaw = spawnRotation.yaw || 0
            const rad = (yaw * Math.PI) / 180
            const forwardX = -Math.sin(rad)
            const forwardZ = -Math.cos(rad)
            
            const blockX = Math.round(pos.x + forwardX * 1.5)
            const blockZ = Math.round(pos.z + forwardZ * 1.5)
            const blockY = Math.floor(pos.y)
            
            // CLIC DROIT (interaction) - pas de destruction
            client.queue('player_action', {
                runtime_entity_id: entityRuntimeId,
                action: 'interact', // INTERACT = click droit
                position: { 
                    x: blockX, 
                    y: blockY + (clickCount % 2), // Alterne entre le bloc et le bloc au-dessus
                    z: blockZ 
                },
                face: 1 // Face supérieure
            })
            
            // Envoyer aussi un paquet interact pour être sûr
            client.queue('interact', {
                runtime_entity_id: entityRuntimeId,
                action: 'interact',
                target_runtime_entity_id: -1
            })
            
            // Alterner les positions pour plus de chances
            // Cliquer sur différentes positions autour
            if (clickCount % 4 === 0) {
                // Devant
                client.queue('player_action', {
                    runtime_entity_id: entityRuntimeId,
                    action: 'interact',
                    position: { 
                        x: blockX, 
                        y: blockY, 
                        z: blockZ 
                    },
                    face: 1
                })
            } else if (clickCount % 4 === 1) {
                // Devant + haut
                client.queue('player_action', {
                    runtime_entity_id: entityRuntimeId,
                    action: 'interact',
                    position: { 
                        x: blockX, 
                        y: blockY + 1, 
                        z: blockZ 
                    },
                    face: 1
                })
            } else if (clickCount % 4 === 2) {
                // À droite
                client.queue('player_action', {
                    runtime_entity_id: entityRuntimeId,
                    action: 'interact',
                    position: { 
                        x: blockX + 1, 
                        y: blockY, 
                        z: blockZ 
                    },
                    face: 1
                })
            } else {
                // À gauche
                client.queue('player_action', {
                    runtime_entity_id: entityRuntimeId,
                    action: 'interact',
                    position: { 
                        x: blockX - 1, 
                        y: blockY, 
                        z: blockZ 
                    },
                    face: 1
                })
            }
            
            clickCount++
            
            // Afficher un message toutes les 100 clics
            if (clickCount % 100 === 0) {
                console.log(`[${clickCount}] ✅ Clics d'interaction envoyés sur le bloc ${blockX}, ${blockY}, ${blockZ}`)
            }
            
        } catch (error) {
            console.error('❌ Erreur lors du clic:', error.message)
        }
    }, 100) // Clic toutes les 100ms (10 clics par seconde)
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
