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

// Position cible (où se trouve la porte)
const TARGET_POSITION = {
    x: 2999859,
    y: -63,
    z: -48
}

let isTeleported = false
let clickInterval = null

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

        if (entityRuntimeId !== null) {
            client.queue('set_local_player_as_initialized', {
                runtime_entity_id: entityRuntimeId
            })
            console.log('set_local_player_as_initialized envoyé')
        }

        sendChat('hello')
        
        // Attendre que le monde soit chargé puis se téléporter
        setTimeout(() => {
            teleportToTarget()
        }, 3000)
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

// Fonction pour se téléporter à la position cible
function teleportToTarget() {
    if (!client) return
    
    console.log(`Tentative de téléportation vers ${TARGET_POSITION.x}, ${TARGET_POSITION.y}, ${TARGET_POSITION.z}`)
    
    try {
        client.queue('command_request', {
            command: `/tp ${username} ${TARGET_POSITION.x} ${TARGET_POSITION.y} ${TARGET_POSITION.z}`
        })
        console.log('Commande /tp envoyée')
    } catch (error) {
        console.log('Erreur avec /tp:', error.message)
    }
    
    // Forcer la téléportation via le protocole
    setTimeout(() => {
        try {
            client.queue('move_player', {
                runtime_entity_id: entityRuntimeId,
                position: { 
                    x: TARGET_POSITION.x, 
                    y: TARGET_POSITION.y, 
                    z: TARGET_POSITION.z 
                },
                rotation: { 
                    x: spawnRotation.pitch, 
                    y: spawnRotation.yaw, 
                    z: 0 
                },
                mode: 'teleport',
                on_ground: true,
                ridden_runtime_entity_id: 0,
                teleport: true
            })
            console.log('Paquet de téléportation envoyé')
            
            actualPosition = {
                x: TARGET_POSITION.x,
                y: TARGET_POSITION.y,
                z: TARGET_POSITION.z
            }
            isTeleported = true
            
            // Démarrer le spam de clics après la téléportation
            setTimeout(() => {
                startSpamClick()
            }, 2000)
        } catch (error) {
            console.log('Erreur avec move_player teleport:', error.message)
        }
    }, 1000)
    
    // Tentative alternative avec /tp relative
    setTimeout(() => {
        try {
            const dx = TARGET_POSITION.x - actualPosition.x
            const dy = TARGET_POSITION.y - actualPosition.y
            const dz = TARGET_POSITION.z - actualPosition.z
            
            client.queue('command_request', {
                command: `/tp ${username} ~${dx} ~${dy} ~${dz}`
            })
            console.log('Commande /tp relative envoyée')
        } catch (error) {
            console.log('Erreur avec /tp relative:', error.message)
        }
    }, 2000)
}

// Fonction pour spammer le click droit
function startSpamClick() {
    if (clickInterval) {
        clearInterval(clickInterval)
    }
    
    console.log('DÉMARRAGE DU SPAM DE CLIC DROIT (interaction)')
    console.log('Le bot va cliquer toutes les 200ms sur la position cible')
    
    // Variables pour alterner les positions de clic
    let clickCount = 0
    
    clickInterval = setInterval(() => {
        if (!client || !entityRuntimeId) return
        
        // Position de la porte
        const pos = TARGET_POSITION
        
        try {
            // CLIC DROIT (interaction) - pas de destruction
            client.queue('player_action', {
                runtime_entity_id: entityRuntimeId,
                action: 'interact', // INTERACT = click droit, pas de destruction
                position: { 
                    x: pos.x, 
                    y: pos.y + (clickCount % 2), // Alterne entre le bloc et le bloc au-dessus
                    z: pos.z 
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
            if (clickCount % 3 === 0) {
                // Cliquer devant
                client.queue('player_action', {
                    runtime_entity_id: entityRuntimeId,
                    action: 'interact',
                    position: { 
                        x: pos.x, 
                        y: pos.y, 
                        z: pos.z + 1 
                    },
                    face: 1
                })
            } else if (clickCount % 3 === 1) {
                // Cliquer à gauche
                client.queue('player_action', {
                    runtime_entity_id: entityRuntimeId,
                    action: 'interact',
                    position: { 
                        x: pos.x + 1, 
                        y: pos.y, 
                        z: pos.z 
                    },
                    face: 1
                })
            } else {
                // Cliquer à droite
                client.queue('player_action', {
                    runtime_entity_id: entityRuntimeId,
                    action: 'interact',
                    position: { 
                        x: pos.x - 1, 
                        y: pos.y, 
                        z: pos.z 
                    },
                    face: 1
                })
            }
            
            clickCount++
            
            // Afficher un message tous les 50 clics
            if (clickCount % 50 === 0) {
                console.log(`[${clickCount}] Clics d'interaction envoyés`)
            }
            
        } catch (error) {
            console.error('Erreur lors du clic:', error.message)
        }
    }, 200) // Clic toutes les 200ms (5 clics par seconde)
}

// Fonction pour arrêter le spam
function stopSpamClick() {
    if (clickInterval) {
        clearInterval(clickInterval)
        clickInterval = null
        console.log('Spam de clics arrêté')
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
        isTeleported = false
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
    <br><br>Position: ${TARGET_POSITION.x}, ${TARGET_POSITION.y}, ${TARGET_POSITION.z}
    <br><br>Status: ${isTeleported ? '🟢 Téléporté et spam de clics actif' : '🟡 En cours de téléportation...'}
    <br><br>Made By <b>https://github.com/healer-op/AternosAfkBot</b>`)
})

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
    console.log('MADE BY HEALER')
    console.log(`Position cible: ${TARGET_POSITION.x}, ${TARGET_POSITION.y}, ${TARGET_POSITION.z}`)
    console.log('Le bot va spammer le click droit en continu !')
})
