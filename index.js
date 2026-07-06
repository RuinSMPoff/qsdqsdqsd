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

// Variables pour la porte
let doorInteracted = false
let doorPosition = null
let teleportAttempts = 0
let isTeleported = false

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

    // Écouter les mises à jour de position
    client.on('move_player', (packet) => {
        if (packet.position) {
            actualPosition = packet.position
            console.log(`Position mise à jour: ${actualPosition.x}, ${actualPosition.y}, ${actualPosition.z}`)
            
            // Vérifier si on est arrivé à la position cible
            if (!isTeleported) {
                checkIfAtTarget()
            }
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
            
            // Vérifier si le message indique que la téléportation a réussi
            if (packet.message.includes('Teleported') || packet.message.includes('téléporté')) {
                console.log('Téléportation réussie!')
                isTeleported = true
                setTimeout(() => {
                    findAndInteractWithDoor()
                }, 2000)
            }
        }
    })

    client.on('error', (err) => {
        console.log('Erreur client:', err.message)
    })

    client.on('disconnect', (packet) => {
        console.log('Déconnecté, raison complète:', JSON.stringify(packet, null, 2))
        connected = 0
        if (tickInterval) clearInterval(tickInterval)
        reconnect()
    })

    client.on('close', () => {
        console.log('Connexion fermée')
        connected = 0
        if (tickInterval) clearInterval(tickInterval)
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
    
    // Méthode 1: Utiliser la commande /tp (si disponible)
    try {
        client.queue('command_request', {
            command: `/tp ${username} ${TARGET_POSITION.x} ${TARGET_POSITION.y} ${TARGET_POSITION.z}`
        })
        console.log('Commande /tp envoyée')
    } catch (error) {
        console.log('Erreur avec /tp:', error.message)
    }
    
    // Méthode 2: Utiliser la téléportation directe via le protocole
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
                mode: 'teleport', // Mode téléportation
                on_ground: true,
                ridden_runtime_entity_id: 0,
                teleport: true
            })
            console.log('Paquet de téléportation envoyé')
            
            // Mettre à jour la position
            actualPosition = {
                x: TARGET_POSITION.x,
                y: TARGET_POSITION.y,
                z: TARGET_POSITION.z
            }
            isTeleported = true
        } catch (error) {
            console.log('Erreur avec move_player teleport:', error.message)
        }
    }, 1000)
    
    // Méthode 3: Utiliser la commande /tp avec les coordonnées relatives
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
    
    // Méthode 4: Forcer la téléportation avec plusieurs tentatives
    setTimeout(() => {
        teleportAttempts++
        if (teleportAttempts < 5 && !isTeleported) {
            console.log(`Tentative de téléportation ${teleportAttempts + 1}`)
            teleportToTarget()
        } else if (isTeleported) {
            console.log('Téléportation réussie!')
            setTimeout(() => {
                findAndInteractWithDoor()
            }, 1000)
        }
    }, 5000)
}

// Vérifier si le bot est à la position cible
function checkIfAtTarget() {
    const distance = Math.sqrt(
        Math.pow(actualPosition.x - TARGET_POSITION.x, 2) +
        Math.pow(actualPosition.y - TARGET_POSITION.y, 2) +
        Math.pow(actualPosition.z - TARGET_POSITION.z, 2)
    )
    
    if (distance < 5) {
        console.log(`Arrivé à la position cible! Distance: ${distance}`)
        isTeleported = true
        if (!doorInteracted) {
            setTimeout(() => {
                findAndInteractWithDoor()
            }, 1000)
        }
    }
}

// Fonction pour interagir avec la porte
function findAndInteractWithDoor() {
    if (!client || doorInteracted) return
    
    console.log('Recherche et interaction avec la porte...')
    console.log(`Position actuelle: ${actualPosition.x}, ${actualPosition.y}, ${actualPosition.z}`)
    
    // Utiliser la position cible
    const pos = TARGET_POSITION
    
    // Essayer d'interagir avec tous les blocs autour
    const offsets = [
        // Devant
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 1, z: 1 },
        { x: 0, y: -1, z: 1 },
        // Derrière
        { x: 0, y: 0, z: -1 },
        { x: 0, y: 1, z: -1 },
        { x: 0, y: -1, z: -1 },
        // Gauche
        { x: 1, y: 0, z: 0 },
        { x: 1, y: 1, z: 0 },
        { x: 1, y: -1, z: 0 },
        // Droite
        { x: -1, y: 0, z: 0 },
        { x: -1, y: 1, z: 0 },
        { x: -1, y: -1, z: 0 },
        // En diagonale
        { x: 1, y: 0, z: 1 },
        { x: -1, y: 0, z: 1 },
        { x: 1, y: 0, z: -1 },
        { x: -1, y: 0, z: -1 }
    ]
    
    // Essayer d'interagir avec chaque bloc autour
    for (const offset of offsets) {
        const targetPos = {
            x: pos.x + offset.x,
            y: pos.y + offset.y,
            z: pos.z + offset.z
        }
        
        setTimeout(() => {
            rightClickBlock(targetPos.x, targetPos.y, targetPos.z)
        }, 500 * offsets.indexOf(offset))
    }
    
    // Essayer de cliquer sur la position exacte
    setTimeout(() => {
        rightClickBlock(pos.x, pos.y, pos.z)
        rightClickBlock(pos.x, pos.y + 1, pos.z)
        rightClickBlock(pos.x, pos.y - 1, pos.z)
    }, 1000)
    
    // Marquer comme interagi après un moment
    setTimeout(() => {
        doorInteracted = true
        console.log('Interaction avec la porte terminée')
    }, 5000)
}

function rightClickBlock(x, y, z) {
    if (!client) return
    
    console.log(`Click droit sur le bloc ${x}, ${y}, ${z}`)
    
    try {
        // Envoyer un paquet d'interaction
        client.queue('player_action', {
            runtime_entity_id: entityRuntimeId,
            action: 'interact',
            position: { x: x, y: y, z: z },
            face: 1
        })
        
        // Envoyer également un paquet d'interaction alternative
        setTimeout(() => {
            client.queue('interact', {
                runtime_entity_id: entityRuntimeId,
                action: 'interact',
                target_runtime_entity_id: -1
            })
        }, 100)
        
        console.log(`Interaction envoyée pour le bloc ${x}, ${y}, ${z}`)
    } catch (error) {
        console.error('Erreur lors de l\'interaction:', error)
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
    <br><br>Made By <b>https://github.com/healer-op/AternosAfkBot</b>`)
})

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
    console.log('MADE BY HEALER')
    console.log(`Position cible: ${TARGET_POSITION.x}, ${TARGET_POSITION.y}, ${TARGET_POSITION.z}`)
})
