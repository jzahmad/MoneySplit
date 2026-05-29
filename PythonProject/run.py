import hashlib
import random
import string


def generate_key(masterkey, num):
    key = []
    seed = hashlib.sha256(masterkey.encode()).hexdigest()
    random.seed(seed)

    letters = string.ascii_uppercase
    for _ in range(num):
        shuffled = random.sample(letters, len(letters))
        key.append(''.join(shuffled))
    return key


def encrypt(myText, myKeys, theIndex):
    # Step 1: Clean and prepare text
    myText = ''.join(c.upper() for c in myText if c.isalpha())
    if not myText:
        print("No valid text to encrypt")
        return ""

    original_length = len(myText)  # Store original length

    # Step 2: Polyalphabetic substitution
    cipherTextChars = []
    for i, char in enumerate(myText):
        keyToUse = myKeys[(theIndex + i) % len(myKeys)]

        try:
            charIndex = string.ascii_uppercase.index(char)
            cipherChar = keyToUse[charIndex]
            cipherTextChars.append(cipherChar)
        except ValueError:
            continue

    # Step 3: Columnar Transposition
    currkey = myKeys[theIndex % len(myKeys)]
    key_length = len(currkey)

    # Pad if necessary
    padding_added = 0
    while len(cipherTextChars) % key_length != 0:
        cipherTextChars.append(random.choice(string.ascii_uppercase))
        padding_added += 1

    # Build matrix row by row
    num_rows = len(cipherTextChars) // key_length
    matrix = []

    for row in range(num_rows):
        start_idx = row * key_length
        end_idx = start_idx + key_length
        matrix.append(cipherTextChars[start_idx:end_idx])

    # Determine column order based on the key
    key_order = sorted(range(key_length), key=lambda k: currkey[k])

    # Read columns in sorted order
    transposed_chars = []
    for col_idx in key_order:
        for row in matrix:
            transposed_chars.append(row[col_idx])

    ciphertext = ''.join(transposed_chars)

    # Return ciphertext AND original length
    return ciphertext, original_length


def decrypt(ciphertext, original_length, myKeys, theIndex):
    # Step 1: Reverse Columnar Transposition
    ciphertext = ciphertext.upper()

    # Get the same key used for encryption
    currkey = myKeys[theIndex % len(myKeys)]
    key_length = len(currkey)

    # Calculate number of rows
    if len(ciphertext) % key_length != 0:
        print("Warning: Ciphertext length not divisible by key length")
        return ""

    num_rows = len(ciphertext) // key_length

    # Determine column order (same as encryption)
    key_order = sorted(range(key_length), key=lambda k: currkey[k])

    # Create empty matrix
    matrix = [['' for _ in range(key_length)] for _ in range(num_rows)]

    # Fill matrix column by column in key order
    ciphertext_idx = 0
    for col_idx in key_order:
        for row in range(num_rows):
            matrix[row][col_idx] = ciphertext[ciphertext_idx]
            ciphertext_idx += 1

    # Read matrix row by row to get original order
    cipherTextChars = []
    for row in matrix:
        cipherTextChars.extend(row)

    # Step 2: Reverse Polyalphabetic Substitution
    plaintextChars = []

    # Only process up to original_length (ignore padding)
    for i in range(original_length):
        char = cipherTextChars[i]
        keyToUse = myKeys[(theIndex + i) % len(myKeys)]
        try:
            cipherIndex = keyToUse.index(char)
            plainChar = string.ascii_uppercase[cipherIndex]
            plaintextChars.append(plainChar)
        except ValueError:
            plaintextChars.append('?')

    plaintext = ''.join(plaintextChars)
    return plaintext


# Main program
keys = []
stored_ciphertext = ""
stored_original_length = 0

while True:
    print("\nOptions:")
    print("1. Generate key")
    print("2. Encrypt")
    print("3. Decrypt")
    print("4. Exit")

    choice = input("Enter your choice: ")

    if choice == "1":
        masterKey = input("Enter master key: ")
        num = int(input("Enter number of keys to generate: "))
        keys = generate_key(masterKey, num)
        for i, key in enumerate(keys):
            print(f"{i}. {key}")

    elif choice == "2":
        if not keys:
            print("Please generate keys first (Option 1)")
            continue

        plaintext = input("Enter plaintext: ")
        index = int(input(f"Enter index of key (0-{len(keys) - 1}): "))
        encryptText, original_len = encrypt(plaintext, keys, index)
        stored_ciphertext = encryptText
        stored_original_length = original_len

        if encryptText:
            print(f"Final ciphertext: {encryptText}")
            print(f"Original text length was: {original_len}")

    elif choice == "3":
        if not keys:
            print("Please generate keys first (Option 1)")
            continue

        ciphertext = input("Enter ciphertext: ")
        index = int(input(f"Enter index of key (0-{len(keys) - 1}): "))

        # Ask for original length or use stored one
        use_stored = input(f"Use stored original length ({stored_original_length})? (y/n): ").lower()
        if use_stored == 'y' and stored_original_length > 0:
            original_len = stored_original_length
        else:
            original_len = int(input("Enter original text length: "))

        decryptText = decrypt(ciphertext, original_len, keys, index)
        if decryptText:
            print(f"Final decrypted text: {decryptText}")

    elif choice == "4":
        exit()