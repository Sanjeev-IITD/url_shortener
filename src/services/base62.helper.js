/**
 * Base62 Bijective Encoding Helper
 * 
 * Provides collision-free encoding/decoding for URL shortening.
 * Maps auto-incrementing PostgreSQL IDs to Base62 strings.
 * 
 * Alphabet: 0-9, a-z, A-Z (62 characters)
 * Supports scaling to 62^10 ≈ 839 quadrillion URLs
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const BASE = ALPHABET.length; // 62

/**
 * Encode a positive integer to Base62 string
 * @param {number} num - Positive integer to encode
 * @returns {string} Base62 encoded string
 * @example encode(1005) => 'g7'
 */
function encode(num) {
    if (typeof num !== 'number' || num < 0 || !Number.isInteger(num)) {
        throw new Error('Input must be a non-negative integer');
    }

    if (num === 0) {
        return ALPHABET[0];
    }

    let encoded = '';
    while (num > 0) {
        encoded = ALPHABET[num % BASE] + encoded;
        num = Math.floor(num / BASE);
    }

    return encoded;
}

/**
 * Decode a Base62 string to integer
 * @param {string} str - Base62 encoded string
 * @returns {number} Decoded integer
 * @example decode('g7') => 1005
 */
function decode(str) {
    if (typeof str !== 'string' || str.length === 0) {
        throw new Error('Input must be a non-empty string');
    }

    let decoded = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const index = ALPHABET.indexOf(char);

        if (index === -1) {
            throw new Error(`Invalid character '${char}' in Base62 string`);
        }

        decoded = decoded * BASE + index;
    }

    return decoded;
}

/**
 * Validate if a string is a valid Base62 encoded value
 * @param {string} str - String to validate
 * @returns {boolean} True if valid Base62 string
 */
function isValidBase62(str) {
    if (typeof str !== 'string' || str.length === 0) {
        return false;
    }

    for (let i = 0; i < str.length; i++) {
        if (ALPHABET.indexOf(str[i]) === -1) {
            return false;
        }
    }

    return true;
}

module.exports = {
    encode,
    decode,
    isValidBase62
};
