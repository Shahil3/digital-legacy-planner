/**
 * Client-Side Encryption Utilities
 * Uses Web Crypto API for AES-GCM encryption
 * Password derivation using PBKDF2
 */

const CryptoUtils = {
    /**
     * Derive encryption key from Aadhaar number using PBKDF2
     */
    async deriveKey(aadharNumber, salt) {
      const encoder = new TextEncoder();
      const keyMaterial = await window.crypto.subtle.importKey(
        'raw',
        encoder.encode(aadharNumber),
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
      );
  
      return window.crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    },
  
    /**
     * Encrypt data using AES-GCM
     * Returns base64 encoded: salt + iv + ciphertext
     */
    async encrypt(data, aadharNumber) {
      try {
        // Generate random salt and IV
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
        // Derive key from Aadhaar number
        const key = await this.deriveKey(aadharNumber, salt);
  
        // Encrypt the data
        const encoder = new TextEncoder();
        const encodedData = encoder.encode(data);
        
        const ciphertext = await window.crypto.subtle.encrypt(
          {
            name: 'AES-GCM',
            iv: iv
          },
          key,
          encodedData
        );
  
        // Combine salt + iv + ciphertext
        const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
        combined.set(salt, 0);
        combined.set(iv, salt.length);
        combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
  
        // Convert to base64
        return this.arrayBufferToBase64(combined);
      } catch (error) {
        console.error('Encryption error:', error);
        throw new Error('Encryption failed');
      }
    },
  
    /**
     * Decrypt data using AES-GCM
     */
    async decrypt(encryptedBase64, aadharNumber) {
      try {
        // Decode from base64
        const combined = this.base64ToArrayBuffer(encryptedBase64);
  
        // Extract salt, iv, and ciphertext
        const salt = combined.slice(0, 16);
        const iv = combined.slice(16, 28);
        const ciphertext = combined.slice(28);
  
        // Derive key from Aadhaar number
        const key = await this.deriveKey(aadharNumber, salt);
  
        // Decrypt
        const decrypted = await window.crypto.subtle.decrypt(
          {
            name: 'AES-GCM',
            iv: iv
          },
          key,
          ciphertext
        );
  
        // Decode to string
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
      } catch (error) {
        console.error('Decryption error:', error);
        throw new Error('Decryption failed - wrong Aadhaar number or corrupted data');
      }
    },
  
    /**
     * Encrypt file (PDF) - converts to base64 then encrypts
     */
    async encryptFile(file, aadharNumber) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
          try {
            const base64File = this.arrayBufferToBase64(new Uint8Array(e.target.result));
            const fileData = JSON.stringify({
              name: file.name,
              type: file.type,
              size: file.size,
              data: base64File
            });
            
            const encrypted = await this.encrypt(fileData, aadharNumber);
            resolve(encrypted);
          } catch (error) {
            reject(error);
          }
        };
        
        reader.onerror = () => reject(new Error('File read error'));
        reader.readAsArrayBuffer(file);
      });
    },
  
    /**
     * Decrypt file - decrypts and returns file object
     */
    async decryptFile(encryptedBase64, aadharNumber) {
      const decrypted = await this.decrypt(encryptedBase64, aadharNumber);
      const fileData = JSON.parse(decrypted);
      
      const byteArray = this.base64ToArrayBuffer(fileData.data);
      const blob = new Blob([byteArray], { type: fileData.type });
      
      return {
        name: fileData.name,
        blob: blob,
        url: URL.createObjectURL(blob)
      };
    },
  
    /**
     * Helper: ArrayBuffer to Base64
     */
    arrayBufferToBase64(buffer) {
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return window.btoa(binary);
    },
  
    /**
     * Helper: Base64 to ArrayBuffer
     */
    base64ToArrayBuffer(base64) {
      const binary = window.atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    },
  
    /**
     * Generate a secure random password
     */
    generatePassword(length = 16) {
      const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
      const randomValues = new Uint8Array(length);
      window.crypto.getRandomValues(randomValues);
      
      let password = '';
      for (let i = 0; i < length; i++) {
        password += charset[randomValues[i] % charset.length];
      }
      return password;
    },
  
    /**
     * Validate Aadhaar number format (12 digits)
     */
    validateAadhaar(aadharNumber) {
      const cleaned = aadharNumber.replace(/\s/g, '');
      return /^\d{12}$/.test(cleaned);
    },
  
    /**
     * Format Aadhaar number (XXXX XXXX XXXX)
     */
    formatAadhaar(aadharNumber) {
      const cleaned = aadharNumber.replace(/\s/g, '');
      return cleaned.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
    }
  };
  
  // Export for use in other scripts
  window.CryptoUtils = CryptoUtils;