// Like 99.9% of this code is from https://github.com/gamedig/node-gamedig/blob/master/lib/reader.js
// All I did was convert it to typescript and add specify some types.

import Iconv from "iconv-lite";
import Long from "long";
import Varint from "varint";

const readUInt64BE = (buffer: Buffer, offset: number): Long => {
	const high = buffer.readUInt32BE(offset);
	const low = buffer.readUInt32BE(offset + 4);
	return new Long(low, high, true);
};
const readUInt64LE = (buffer: Buffer, offset: number): Long => {
	const low = buffer.readUInt32LE(offset);
	const high = buffer.readUInt32LE(offset + 4);
	return new Long(low, high, true);
};

export default class Reader {
	defaultEncoding: string = "utf8";
	defaultDelimiter: string = "\0";
	defaultByteOrder: string = "le";
	buffer: Buffer;
	i: number = 0;

	constructor(buffer: Buffer) {
		this.buffer = buffer;
	}

	setOffset(offset: number) {
		this.i = offset;
	}

	offset() {
		return this.i;
	}

	skip(i: number) {
		this.i += i;
	}

	pascalString(bytesForSize: number, adjustment = 0) {
		const length = this.uint(bytesForSize) + adjustment;
		return this.string(length);
	}

	string(arg?: any) {
		let encoding = this.defaultEncoding;
		let length = null;
		let delimiter = this.defaultDelimiter;

		if (typeof arg === "string") delimiter = arg;
		else if (typeof arg === "number") length = arg;
		else if (typeof arg === "object") {
			if ("encoding" in arg) encoding = arg.encoding;
			if ("length" in arg) length = arg.length;
			if ("delimiter" in arg) delimiter = arg.delimiter;
		}

		if (encoding === "latin1") encoding = "win1252";

		const start = this.i;
		let end = start;
		if (length === null) {
			let delim: any = delimiter;
			if (typeof delim === "string") delim = delim.charCodeAt(0);
			while (true) {
				if (end >= this.buffer.length) {
					end = this.buffer.length;
					break;
				}
				if (this.buffer.readUInt8(end) === delim) break;
				end++;
			}
			this.i = end + 1;
		} else if (length <= 0) {
			return "";
		} else {
			end = start + length;
			if (end >= this.buffer.length) {
				end = this.buffer.length;
			}
			this.i = end;
		}

		const slice = this.buffer.slice(start, end);
		const enc = encoding;
		if (enc === "utf8" || enc === "ucs2" || enc === "binary") {
			return slice.toString(enc);
		} else {
			return Iconv.decode(slice, enc);
		}
	}

	int(bytes: number) {
		let r = 0;
		if (this.remaining() >= bytes) {
			if (this.defaultByteOrder === "be") {
				if (bytes === 1) r = this.buffer.readInt8(this.i);
				else if (bytes === 2) r = this.buffer.readInt16BE(this.i);
				else if (bytes === 4) r = this.buffer.readInt32BE(this.i);
			} else {
				if (bytes === 1) r = this.buffer.readInt8(this.i);
				else if (bytes === 2) r = this.buffer.readInt16LE(this.i);
				else if (bytes === 4) r = this.buffer.readInt32LE(this.i);
			}
		}
		this.i += bytes;
		return r;
	}

	uint(bytes: number): number {
		let r: number = 0;
		if (this.remaining() >= bytes) {
			if (this.defaultByteOrder === "be") {
				if (bytes === 1) r = this.buffer.readUInt8(this.i);
				else if (bytes === 2) r = this.buffer.readUInt16BE(this.i);
				else if (bytes === 4) r = this.buffer.readUInt32BE(this.i);
				else if (bytes === 8) r = readUInt64BE(this.buffer, this.i).toNumber();
			} else {
				if (bytes === 1) r = this.buffer.readUInt8(this.i);
				else if (bytes === 2) r = this.buffer.readUInt16LE(this.i);
				else if (bytes === 4) r = this.buffer.readUInt32LE(this.i);
				else if (bytes === 8) r = readUInt64LE(this.buffer, this.i).toNumber();
			}
		}
		this.i += bytes;
		return r;
	}

	float() {
		let r = 0;
		if (this.remaining() >= 4) {
			if (this.defaultByteOrder === "be") r = this.buffer.readFloatBE(this.i);
			else r = this.buffer.readFloatLE(this.i);
		}
		this.i += 4;
		return r;
	}

	varint() {
		const out = Varint.decode(this.buffer, this.i);
		this.i += Varint.decode.bytes;
		return out;
	}

	part(bytes: number) {
		let r;
		if (this.remaining() >= bytes) {
			r = this.buffer.slice(this.i, this.i + bytes);
		} else {
			r = Buffer.from([]);
		}
		this.i += bytes;
		return r;
	}

	remaining() {
		return this.buffer.length - this.i;
	}

	rest() {
		return this.buffer.slice(this.i);
	}

	done() {
		return this.i >= this.buffer.length;
	}
}
