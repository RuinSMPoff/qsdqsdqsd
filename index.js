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
let spawnPosition = { x: 0, y: 64, z: 0 }
let spawnRotation = { pitch: 0, yaw: 0, headYaw: 0 }

// Ajout : détection de la porte et interaction
let doorFound = false
let doorPosition = null
let isDoorOpen = false

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
        }
        if (typeof packet.rotation !== 'undefined') {
            spawnRotation.pitch = packet.rotation.x || 0
            spawnRotation.yaw = packet.rotation.y || 0
            spawnRotation.headYaw = packet.rotation.y || 0
        }
        console.log('start_game reçu, position de spawn:', spawnPosition)
    })

    client.on('spawn', () => {
        console.log('Bot spawn dans le monde')

        if (entityRuntimeId !== null) {
            client.queue('set_local_player_as_initialized', {
                runtime_entity_id: entityRuntimeId
            })
            console.log('set_local_player_as_initialized envoyé')
        } else {
            console.log('ATTENTION: entityRuntimeId non défini, set_local_player_as_initialized non envoyé')
        }

        sendChat('hello')
        
        // Démarrer la recherche de porte
        setTimeout(() => {
            findAndInteractWithDoor()
        }, 3000) // Attendre 3 secondes pour que le monde se charge
    })

    // Écouter les paquets de mise à jour des blocs pour détecter les portes
    client.on('level_chunk', (packet) => {
        // Ici tu pourrais analyser les chunks pour trouver les portes
        // Mais c'est complexe, on va plutôt utiliser une approche plus simple
    })

    // Utiliser une commande de test pour voir les blocs autour
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

// Nouvelle fonction pour trouver et interagir avec une porte
function findAndInteractWithDoor() {
    if (!client) return
    
    console.log('Recherche d\'une porte à proximité...')
    
    // Position du joueur
    const pos = spawnPosition
    
    // Vérifier les blocs autour du joueur (dans un rayon de 2 blocs)
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
    ]
    
    // IDs des types de portes (à vérifier selon la version)
    const doorIds = [
        'minecraft:oak_door', 
        'minecraft:spruce_door', 
        'minecraft:birch_door', 
        'minecraft:jungle_door',
        'minecraft:acacia_door', 
        'minecraft:dark_oak_door',
        'minecraft:iron_door',
        'minecraft:mangrove_door',
        'minecraft:cherry_door',
        'minecraft:bamboo_door',
        'minecraft:crimson_door',
        'minecraft:warped_door'
    ]
    
    // Pour chaque offset, vérifier si c'est une porte
    for (const offset of offsets) {
        const checkPos = {
            x: Math.floor(pos.x + offset.x),
            y: Math.floor(pos.y + offset.y),
            z: Math.floor(pos.z + offset.z)
        }
        
        // Demander l'état du bloc
        client.queue('command_request', {
            command: `/testforblock ${checkPos.x} ${checkPos.y} ${checkPos.z} oak_door`
            // Cette commande peut ne pas fonctionner sur tous les serveurs
        })
        
        console.log(`Vérification du bloc en position ${checkPos.x}, ${checkPos.y}, ${checkPos.z}`)
    }
    
    // Méthode alternative : interagir directement avec le bloc devant le joueur
    setTimeout(() => {
        interactWithBlockInFront()
    }, 1000)
}

// Fonction pour interagir avec le bloc devant le joueur
function interactWithBlockInFront() {
    console.log('Tentative d\'interaction avec le bloc devant le joueur...')
    
    // Calculer la position du bloc devant le joueur
    const pos = spawnPosition
    const yaw = spawnRotation.yaw
    
    // Convertir le yaw en direction
    let forwardX = 0
    let forwardZ = 0
    
    // Yaw de 0 = nord, 90 = est, 180 = sud, 270 = ouest
    // Ajuster selon la convention de Minecraft
    const rad = (yaw * Math.PI) / 180
    forwardX = -Math.sin(rad)
    forwardZ = -Math.cos(rad)
    
    // Arrondir à l'entier le plus proche
    const blockX = Math.round(pos.x + forwardX * 1.5)
    const blockZ = Math.round(pos.z + forwardZ * 1.5)
    const blockY = Math.floor(pos.y) // Au niveau des yeux du joueur
    
    console.log(`Bloc devant le joueur : ${blockX}, ${blockY}, ${blockZ}`)
    
    // Envoyer un paquet d'interaction avec le bloc
    // Méthode 1 : Utiliser player_action pour interagir avec le bloc
    client.queue('player_action', {
        runtime_entity_id: entityRuntimeId,
        action: 'interact', // ou 'start_break' pour détruire
        position: { x: blockX, y: blockY, z: blockZ },
        face: 1 // La face à interagir (1 = haut, 2 = bas, etc.)
    })
    
    console.log('Paquet d\'interaction envoyé !')
    
    // Méthode 2 : Utiliser interact comme alternative
    setTimeout(() => {
        client.queue('interact', {
            runtime_entity_id: entityRuntimeId,
            action: 'open_inventory' // Ou 'mouseover' pour interagir avec un bloc
        })
        console.log('Paquet interact envoyé !')
    }, 500)
    
    // Méthode 3 : Essayer d'utiliser une commande (si disponible)
    setTimeout(() => {
        // Envoyer un click droit sur le bloc
        client.queue('player_action', {
            runtime_entity_id: entityRuntimeId,
            action: 'start_break',
            position: { x: blockX, y: blockY, z: blockZ },
            face: 1
        })
        
        // Puis immédiatement arrêter pour simuler un click
        setTimeout(() => {
            client.queue('player_action', {
                runtime_entity_id: entityRuntimeId,
                action: 'abort_break',
                position: { x: blockX, y: blockY, z: blockZ },
                face: 1
            })
            console.log('Click droit simulé sur la porte')
        }, 100)
    }, 1000)
}

// Fonction pour envoyer un click droit sur une position spécifique
function rightClickBlock(x, y, z) {
    if (!client) return
    
    console.log(`Click droit sur le bloc ${x}, ${y}, ${z}`)
    
    // Envoyer un paquet d'interaction
    client.queue('player_action', {
        runtime_entity_id: entityRuntimeId,
        action: 'start_break',
        position: { x: x, y: y, z: z },
        face: 1
    })
    
    // Annuler l'action pour simuler un click droit
    setTimeout(() => {
        client.queue('player_action', {
            runtime_entity_id: entityRuntimeId,
            action: 'abort_break',
            position: { x: x, y: y, z: z },
            face: 1
        })
    }, 100)
}

// Fonction pour trouver automatiquement la porte en avançant
function findDoorByMoving() {
    console.log('Déplacement pour trouver une porte...')
    
    // Positions à tester en avançant
    const positions = [
        { x: 0, z: 1 },
        { x: 0, z: 2 },
        { x: 1, z: 1 },
        { x: -1, z: 1 },
        { x: 0, z: 3 }
    ]
    
    for (const pos of positions) {
        const checkPos = {
            x: Math.floor(spawnPosition.x + pos.x),
            y: Math.floor(spawnPosition.y),
            z: Math.floor(spawnPosition.z + pos.z)
        }
        
        // Essayer d'interagir avec chaque position
        setTimeout(() => {
            rightClickBlock(checkPos.x, checkPos.y, checkPos.z)
        }, 500 * positions.indexOf(pos))
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

// --- Express (site web de statut) ---
const port = process.env.PORT || 3000
const app = express()

app.get('/', (req, res) => {
    res.send(`<b>${username}</b> is Online At <b>${host}</b>
    <br><br>Connected: <b>${connected ? 'Yes' : 'No'}</b>
    <br><br>Popularity Counter <b>${popularity}</b>
    <br><br>Made By <b>https://github.com/healer-op/AternosAfkBot</b>`)
})

app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port}`)
    console.log('MADE BY HEALER')
})
