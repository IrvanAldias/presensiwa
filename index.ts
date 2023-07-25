import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys'
import '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import moment from 'moment-timezone'
import isPointWithinRadius from 'geolib'
import axios from 'axios'

const BASE_URL = "https://script.google.com/macros/s/AKfycbx-ATqdP5YbdVGFPMvaCQwYqttJFwkVsTCbQZYpf2pNJSCXlMH4uO5W50eLiyYturgm/exec?"

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth')
    const sock = makeWASocket({
        // can provide additional config here
        printQRInTerminal: true,
        auth: state
    })
    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
            console.log('connection closed due to ', lastDisconnect?.error, ', reconnecting ', shouldReconnect)
            // reconnect if not logged out
            if (shouldReconnect) {
                connectToWhatsApp()
            }
        } else if (connection === 'open') {
            console.log('opened connection')
        }
    })
    sock.ev.on('messages.upsert', async m => {
        // console.log(JSON.stringify(m, undefined, 2))

        // console.log('replying to', m.messages[0].key.remoteJid)

        const msg = m.messages[0];
        const geolib = require('geolib')

        if (!msg.key.fromMe && m.type === 'notify') {
            if (msg.message?.locationMessage) {
                const latitude1 = msg.message?.locationMessage?.degreesLatitude
                const longitude1 = msg.message?.locationMessage?.degreesLongitude
                const timestamp = msg.messageTimestamp
                const date = processDate(timestamp)
                const time = processTime(timestamp)
                const coordinate = latitude1 + ", " + longitude1

                const cekradius = geolib.isPointWithinRadius(
                    { latitude: latitude1, longitude: longitude1 },
                    { latitude: -8.4884874, longitude: 117.4231583 },
                    200 //0.2km
                )

                if (cekradius) {
                    axios.get(`${BASE_URL}action=presensi&whatsapp=${msg.key.remoteJid!.replace("@s.whatsapp.net", "")}&date=${date}&time=${time}&coordinate=${coordinate}`)
                        .then(async (response) => {
                            console.log('JUDUL JUDUL' + JSON.stringify(response.data))
                            let { success, data, message } = response.data;
                            if (success) {
                                await sock.sendMessage(msg.key.remoteJid!, { text: `🎉 *Berhasil Melakukan Presensi*\n\n📌 Lokasi : ${coordinate}\n📅 Tanggal : ${date}\n🕛 ${time}` })
                                console.log(msg)
                                const reactionMessage = {
                                    react: {
                                        text: "👍", // use an empty string to remove the reaction
                                        key: msg.key
                                    }
                                }
                                await sock.sendMessage(msg.key.remoteJid!, reactionMessage)
                                console.log(msg)
                            } else {
                                await sock.sendMessage(msg.key.remoteJid!, { text: message })
                                console.log(msg)
                            }
                        })
                } else {
                    await sock.sendMessage(msg.key.remoteJid!, { text: `❌ *Gagal Melakukan Presensi*\n\n📌 Lokasi : ${latitude1}, ${longitude1}\n Anda berada di luar jangkauan kantor` })
                    console.log(msg)
                }
            // } else if (msg.message?.conversation === 'cek-status') {
            //     const timestamp = msg.messageTimestamp
            //     await sock.sendMessage(msg.key.remoteJid!, { text: `*Sistem Presensi Mitra BPS*\n\nIni merupakan bot presensi online. Silahkan kirim lokasi saat ini untuk presensi. \n${timestamp}\n${processTime(timestamp)}\n${processDate(timestamp)}` })
            //     console.log(msg)
            } else {
                const timestamp = msg.messageTimestamp
                await sock.sendMessage(msg.key.remoteJid!, { text: `*Sistem Presensi Mitra BPS*\n\nIni merupakan bot presensi online. Silahkan kirim lokasi anda saat ini untuk presensi.\n\n*Bukan live location, melainkan your current location*` })
                console.log(msg)
            }
        }
    })
}

function processDate(date: any) {
    return moment.unix(date).tz('Asia/Makassar').format('DD-MM-YYYY')
}

function processTime(time: any) {
    return moment.unix(time).tz('Asia/Makassar').format('hh:mm') + " WITA"
}

// run in main file
connectToWhatsApp()