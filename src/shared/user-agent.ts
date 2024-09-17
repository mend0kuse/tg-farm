export function getRandomIOSUserAgent() {
    const randomVersion = iOSVersions[Math.floor(Math.random() * iOSVersions.length)];
    const randomModel = iPhoneModels[Math.floor(Math.random() * iPhoneModels.length)];
    return `Mozilla/5.0 (${randomModel}; CPU iPhone OS ${randomVersion} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1`;
}

export function getRandomAndroidUserAgent() {
    const randomVersion = androidVersions[Math.floor(Math.random() * androidVersions.length)];
    const randomDevice = androidDevices[Math.floor(Math.random() * androidDevices.length)];

    return `Mozilla/5.0 (Linux; Android ${randomVersion}; ${randomDevice}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Mobile Safari/537.36`;
}

const iOSVersions = [
    '14_0',
    '14_1',
    '14_2',
    '14_3',
    '14_4',
    '14_5',
    '14_6',
    '14_7',
    '14_8',
    '15_0',
    '15_1',
    '15_2',
    '15_3',
    '15_4',
    '15_5',
    '15_6',
    '15_7',
    '16_0',
    '16_1',
    '16_2',
    '16_3',
    '16_4',
    '16_5',
    '16_6',
    '16_7',
    '17_0',
    '17_1',
    '17_2',
    '17_3',
    '17_4',
    '17_5',
];

const iPhoneModels = [
    'iPhone11,2',
    'iPhone11,4',
    'iPhone11,6',
    'iPhone11,8',
    'iPhone12,1',
    'iPhone12,3',
    'iPhone12,5',
    'iPhone13,1',
    'iPhone13,2',
    'iPhone13,3',
    'iPhone13,4',
    'iPhone14,2',
    'iPhone14,3',
    'iPhone14,4',
    'iPhone14,5',
];

const androidVersions = [
    '9', // Pie
    '10', // Android 10
    '11', // Android 11
    '12', // Android 12
    '13', // Android 13
    '14', // Android 14
];

const androidDevices = [
    'Pixel 4',
    'Pixel 4 XL',
    'Pixel 5',
    'Pixel 5a',
    'Pixel 6',
    'Pixel 6 Pro',
    'Pixel 7',
    'Samsung Galaxy S21',
    'Samsung Galaxy S21+',
    'Samsung Galaxy S21 Ultra',
    'Samsung Galaxy S22',
    'OnePlus 8',
    'OnePlus 8 Pro',
    'OnePlus 9',
    'Xiaomi Mi 11',
    'Xiaomi Mi 12',
];
