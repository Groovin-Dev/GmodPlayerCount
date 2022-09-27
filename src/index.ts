import { createSocket, Socket } from "dgram";
import { writeFileSync } from "fs";
import chalk from "chalk";
import Reader from "./lib/reader";

const main = async () => {
	const ip = "";
	const port = 27017; // Default port for Gmod

	let players = await getPlayers(ip, port);

	console.log(players);
};

interface Player {
	index: number;
	name: string;
	score: number;
	duration: number;
	durationClean: string;
}

interface PlayerResponse {
	count: number;
	players: Player[];
}

/**
 * Sends an A2S_PLAYER request to the server.
 * https://developer.valvesoftware.com/wiki/Server_queries#A2S_PLAYER
 * @param ip The address to send the packet
 */
const getPlayers = async (ip: string, port: number) => {
	const socket = createSocket("udp4");

	/*
	Request Format
	Data		Type 	Value
	Header		byte 	'U' (0x55)
	Challenge	int 	Challenge number, or -1 (0xFFFFFFFF) to receive a challenge number. 
	*/

	/*
	Challenge response format:
	Data		Type 	Value
	Header		byte 	'A' (0x41)
	Challenge	int 	Challenge number.
	*/

	/*
	Example challenge request:
	FF FF FF FF 55 FF FF FF FF                         ÿÿÿÿUÿÿÿÿ"       

	Example challenge response:
	FF FF FF FF 41 4B A1 D5 22                         ÿÿÿÿAÿÿÿÿ"       

	Example A2S_PLAYER request with the received challenge number:
	FF FF FF FF 55 4B A1 D5 22                         ÿÿÿÿUÿÿÿÿ"       
	*/

	const challengePacket = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x55, 0xff, 0xff, 0xff, 0xff]);
	const challengeResponse = await sendPacket(socket, challengePacket, ip, port);
	logChallengeResponse(challengeResponse);

	const playerPacket = Buffer.from([0xff, 0xff, 0xff, 0xff, 0x55, challengeResponse[5], challengeResponse[6], challengeResponse[7], challengeResponse[8]]);
	const playerResponse = await sendPacket(socket, playerPacket, ip, port);
	logPlayerResponse(playerResponse);

	const playerResponseData = processPlayerResponse(playerResponse);

	socket.close();

	return playerResponseData;
};

const logChallengeResponse = (response: Buffer) => {
	console.log(chalk`{green.bold Challenge response:}`);
	console.log(chalk`{green.bold Header:} {blue ${response[4].toString(16).toUpperCase()}}`);
	console.log(
		chalk`{green.bold Challenge:} {blue ${response[5].toString(16).toUpperCase()}} {blue ${response[6].toString(16).toUpperCase()}} {blue ${response[7]
			.toString(16)
			.toUpperCase()}} {blue ${response[8].toString(16).toUpperCase()}}`
	);
};

const logPlayerResponse = (response: Buffer) => {
	console.log(chalk`{green.bold Player response:}`);
	console.log(chalk`{green.bold Header:} {blue ${response[4].toString(16).toUpperCase()}}`);
	console.log(chalk`{green.bold Players:} {blue ${response[5].toString(16).toUpperCase()}}`);

	// Write the full response to a binary file
	// writeFileSync("playerResponse.bin", response);
};

const sendPacket = (socket: Socket, packet: Buffer, ip: string, port: number): Promise<Buffer> => {
	return new Promise((resolve, reject) => {
		socket.send(packet, port, ip, (err) => {
			if (err) {
				reject(err);
			}
		});

		socket.on("message", (msg) => {
			resolve(msg);
		});
	});
};

const processPlayerResponse = (response: Buffer): PlayerResponse => {
	/*
	Response Format
	Data		Type 	Comment
	Header		byte 	Always equal to 'D' (0x44)
	Players		byte 	Number of players whose information was gathered.
		For every player in "Players" there is this chunk in the response:
		Data		Type 	Comment
		Index		byte 	Index of player chunk starting from 0.
		Name		string 	Name of the player.
		Score		long 	Player's score (usually "frags" or "kills".)
		Duration	float 	Time (in seconds) player has been connected to the server. 
	*/
	/*
	Example response:
	FF FF FF FF 44 02 01 5B 44 5D 2D 2D 2D 2D 3E 54    ÿÿÿÿD..[D]---->T
	2E 4E 2E 57 3C 2D 2D 2D 2D 00 0E 00 00 00 B4 97    .N.W<----.....´—
	00 44 02 4B 69 6C 6C 65 72 20 21 21 21 00 05 00    .D.Killer !!!...
	00 00 69 24 D9 43 
	*/

	const players: Player[] = [];

	// The first 5 bytes are the header and it's always 0x44 so we dont care about them
	const reader = new Reader(response.slice(5));

	const playerCount = reader.uint(1);
	for (let i = 0; i < playerCount; i++) {
		// For some reason Garry's Mod returns 0x00 as the first byte of the player index and it never changes
		// So if you are testing this with a Gmod server, the index will always be 0. It's not a bug in the code.
		let index = reader.uint(1);
		let name = reader.string();
		let score = reader.int(4);
		let duration = reader.float();

		const player: Player = {
			index,
			name,
			score,
			duration,
			durationClean: formatDuration(duration),
		};

		players.push(player);
	}

	return {
		count: playerCount,
		players,
	};
};

// Duration is sent in seconds so we need to convert it to a human readable format
const formatDuration = (duration: number) => {
	const durationInt = Math.floor(duration);

	const hours = Math.floor(durationInt / 3600);
	const minutes = Math.floor((durationInt - hours * 3600) / 60);
	const seconds = Math.floor(durationInt - hours * 3600 - minutes * 60);

	return `${hours}h ${minutes}m ${seconds}s`;
};

main();
