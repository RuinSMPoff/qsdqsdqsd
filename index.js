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

function startBot() {
    client = bedrock.createClient({
        host: host,
        port: data["port"],
        username: username,
        offline: false,
        auth: 'microsoft'
        // version: '1.21.50' // décommente et adapte si le serveur refuse la connexion (mismatch de version)
    })

    client.on('join', () => {
        console.log('Connecté au serveur Bedrock')
        connected = 1
    })

    // Récupère l'ID d'entité et la position/rotation réelles de spawn
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

        // ÉTAPE OBLIGATOIRE : sans ce paquet le serveur considère
        // que le joueur n'a jamais fini de charger et le déconnecte.
        if (entityRuntimeId !== null) {
            client.queue('set_local_player_as_initialized', {
                runtime_entity_id: entityRuntimeId
            })
            console.log('set_local_player_as_initialized envoyé')
        } else {
            console.log('ATTENTION: entityRuntimeId non défini, set_local_player_as_initialized non envoyé')
        }

        sendChat('hello')
        // Pas besoin d'envoyer de mouvement pour rester connecté :
        // RakNet gère le keep-alive tout seul au niveau de la connexion.
        // Envoyer player_auth_input sans que le serveur l'attende (mode
        // "Server Authoritative Movement" désactivé côté PocketMine-MP)
        // provoque un "Packet processing error" et un kick immédiat.
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

// Fonction gardée mais désactivée (plus jamais appelée) : à n'utiliser QUE
// si tu vérifies d'abord que start_game indique bien le mode "server
// authoritative movement" activé. Sinon ça provoque un kick immédiat.
function startTickLoop() {
    if (tickInterval) clearInterval(tickInterval)
    let tick = 0n

    tickInterval = setInterval(() => {
        tick++
        client.queue('player_auth_input', {
            pitch: spawnRotation.pitch,
            yaw: spawnRotation.yaw,
            position: { x: spawnPosition.x, y: spawnPosition.y, z: spawnPosition.z },
            move_vector: { x: 0, z: 0 },
            head_yaw: spawnRotation.headYaw,
            input_data: {
                ascend: false, descend: false, north_jump: false, jump_down: false,
                sprint_down: false, change_height: false, jumping: false,
                auto_jumping_in_water: false, sneaking: false, sneak_down: false,
                up: false, down: false, left: false, right: false,
                up_left: false, up_right: false, want_up: false, want_down: false,
                want_down_slow: false, want_up_slow: false, sprinting: false,
                ascend_block: false, descend_block: false, sneak_toggle_down: false,
                persist_sneak: false, start_sprinting: false, stop_sprinting: false,
                start_sneaking: false, stop_sneaking: false, start_swimming: false,
                stop_swimming: false, start_jumping: false, start_gliding: false,
                stop_gliding: false, item_interact: false, block_action: false,
                item_stack_request: false, handled_teleport: false, emoting: false,
                missed_swing: false, start_crawling: false, stop_crawling: false,
                start_flying: false, stop_flying: false, received_server_data: false,
                client_predicted_vehicle: false, paddling_left: false, paddling_right: false,
                block_breaking_delay_enabled: false, horizontal_collision: false,
                vertical_collision: false, down_left: false, down_right: false,
                start_using_item: false, camera_relative_movement_enabled: false,
                rot_controlled_by_move_direction: false, start_spin_attack: false,
                stop_spin_attack: false, hotbar_only_touch: false, jump_released_raw: false,
                jump_pressed_raw: false, jump_current_raw: false, sneak_released_raw: false,
                sneak_pressed_raw: false, sneak_current_raw: false
            },
            input_mode: 'mouse',
            play_mode: 'normal',
            interaction_model: 'crosshair',
            interact_rotation: { x: 0, z: 0 },
            tick: tick,
            delta: { x: 0, y: 0, z: 0 },
            analogue_move_vector: { x: 0, z: 0 },
            camera_orientation: { x: 0, y: 0, z: 0 },
            raw_move_vector: { x: 0, z: 0 }
        })
    }, 50) // 20 fois par seconde
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