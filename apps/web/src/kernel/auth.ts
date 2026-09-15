import {
  createHash,
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "crypto";

const PASSWORD_VERSION = "scrypt-v1";
const SALT_BYTES = 16;
const SESSION_TOKEN_BYTES = 32;
const DERIVED_KEY_BYTES = 64;

const SCRYPT_OPTIONS: ScryptOptions = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
};

export const AUTH_SESSION_COOKIE_NAME =
  "larcoos_session";

export const AUTH_SESSION_DURATION_SECONDS =
  60 * 60 * 12;

export type PasswordVerificationResult = {
  valid: boolean;
  needsRehash: boolean;
};

function normalizeHex(value: string) {
  return value.trim().toLowerCase();
}

function isHex(value: string) {
  return (
    value.length > 0 &&
    value.length % 2 === 0 &&
    /^[0-9a-f]+$/i.test(value)
  );
}

function safeHexEqual(
  leftHex: string,
  rightHex: string
) {
  const left = normalizeHex(leftHex);
  const right = normalizeHex(rightHex);

  if (!isHex(left) || !isHex(right)) {
    return false;
  }

  const leftBuffer = Buffer.from(
    left,
    "hex"
  );

  const rightBuffer = Buffer.from(
    right,
    "hex"
  );

  if (
    leftBuffer.length !==
    rightBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    leftBuffer,
    rightBuffer
  );
}

function derivePasswordKey(
  password: string,
  saltHex: string
): Promise<string> {
  const salt = Buffer.from(
    saltHex,
    "hex"
  );

  return new Promise(
    (resolve, reject) => {
      scrypt(
        password,
        salt,
        DERIVED_KEY_BYTES,
        SCRYPT_OPTIONS,
        (error, derivedKey) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(
            derivedKey.toString("hex")
          );
        }
      );
    }
  );
}

export function normalizeLoginIdentifier(
  value: string
) {
  return value.trim().toLowerCase();
}

export function validatePasswordForCreation(
  password: string
) {
  if (password.length < 12) {
    throw new Error(
      "Password must contain at least 12 characters"
    );
  }

  if (password.length > 256) {
    throw new Error(
      "Password is too long"
    );
  }

  return password;
}

export async function hashPassword(
  password: string
) {
  validatePasswordForCreation(password);

  const saltHex = randomBytes(
    SALT_BYTES
  ).toString("hex");

  const derivedKeyHex =
    await derivePasswordKey(
      password,
      saltHex
    );

  return [
    PASSWORD_VERSION,
    saltHex,
    derivedKeyHex,
  ].join("$");
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<PasswordVerificationResult> {
  if (
    typeof password !== "string" ||
    typeof storedHash !== "string"
  ) {
    return {
      valid: false,
      needsRehash: false,
    };
  }

  const parts = storedHash.split("$");

  if (parts.length !== 3) {
    return {
      valid: false,
      needsRehash: false,
    };
  }

  const [
    version,
    saltHex,
    expectedKeyHex,
  ] = parts;

  if (
    version !== PASSWORD_VERSION ||
    !isHex(saltHex) ||
    !isHex(expectedKeyHex)
  ) {
    return {
      valid: false,
      needsRehash: false,
    };
  }

  try {
    const actualKeyHex =
      await derivePasswordKey(
        password,
        saltHex
      );

    return {
      valid: safeHexEqual(
        actualKeyHex,
        expectedKeyHex
      ),
      needsRehash: false,
    };
  } catch {
    return {
      valid: false,
      needsRehash: false,
    };
  }
}

export function generateSessionToken() {
  return randomBytes(
    SESSION_TOKEN_BYTES
  ).toString("base64url");
}

export function hashSessionToken(
  token: string
) {
  return createHash("sha256")
    .update(token, "utf8")
    .digest("hex");
}

export function getSessionExpirationDate(
  now = new Date()
) {
  return new Date(
    now.getTime() +
      AUTH_SESSION_DURATION_SECONDS *
        1000
  );
}

export function getSessionCookieOptions(
  expires: Date
) {
  return {
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export function getExpiredSessionCookieOptions() {
  return {
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      "production",
    sameSite: "lax" as const,
    path: "/",
    expires: new Date(0),
  };
}