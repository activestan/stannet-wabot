const axios = require('axios');
const https = require('https');
const fs = require('fs');

const OMADA_URL = process.env.OMADA_URL;
const USERNAME = process.env.OMADA_USERNAME;
const PASSWORD = process.env.OMADA_PASSWORD;

const agent = new https.Agent({ rejectUnauthorized: false });
const USED_VOUCHERS_FILE = 'used_vouchers.json';

let sessionCookie = null;
let csrfToken = null;
let controllerId = null;

// ==================== USED VOUCHERS TRACKING ====================

function loadUsedVouchers() {
    if (!fs.existsSync(USED_VOUCHERS_FILE)) return new Set();
    return new Set(JSON.parse(fs.readFileSync(USED_VOUCHERS_FILE)));
}

function saveUsedVoucher(code) {
    const used = loadUsedVouchers();
    used.add(code);
    fs.writeFileSync(USED_VOUCHERS_FILE, JSON.stringify([...used], null, 2));
}

function isVoucherUsed(code) {
    const used = loadUsedVouchers();
    return used.has(code);
}

// ==================== OMADA LOGIN ====================

async function loginToOmada() {
    try {
        const response = await axios.post(`${OMADA_URL}/api/v2/login`, {
            username: USERNAME,
            password: PASSWORD
        }, {
            httpsAgent: agent,
            withCredentials: true
        });

        if (response.data.errorCode === 0) {
            sessionCookie = response.headers['set-cookie'];
            csrfToken = response.data.result.token;

            const info = await axios.get(`${OMADA_URL}/api/info`, {
                httpsAgent: agent
            });
            controllerId = info.data.result.omadacId;

            console.log('✅ Successfully logged into Omada');
            return true;
        } else {
            console.log('❌ Omada login failed');
            return false;
        }
    } catch (error) {
        console.error('Omada login error:', error.message);
        return false;
    }
}

// ==================== FETCH VOUCHER ====================

async function getUnusedVoucher(amount) {
    if (!controllerId || !csrfToken) {
        console.log('Not logged into Omada');
        return null;
    }

    const voucherNameMap = {
        400: "whatsapp 1",
        1000: "whatsapp 3",
        2000: "whatsapp 7",
        7000: "whatsapp 31"
    };

    const targetName = voucherNameMap[amount];
    if (!targetName) return null;

    try {
        const response = await axios.get(
            `${OMADA_URL}/${controllerId}/api/v2/hotspot/vouchers?currentPage=1&currentPageSize=100&status=All`,
            {
                httpsAgent: agent,
                headers: {
                    'Cookie': sessionCookie,
                    'Csrf-Token': csrfToken
                }
            }
        );

        if (response.data.errorCode === 0) {
            const vouchers = response.data.result.data || [];

            // Find unused voucher with matching name that hasn't been used before
            const unusedVoucher = vouchers.find(v => 
                v.name && 
                v.name.toLowerCase().includes(targetName.toLowerCase()) && 
                v.status === 0 &&
                !isVoucherUsed(v.code)
            );

            if (unusedVoucher) {
                // Save as used immediately
                saveUsedVoucher(unusedVoucher.code);

                return {
                    code: unusedVoucher.code,
                    duration: unusedVoucher.name
                };
            }
        }

        return null;
    } catch (error) {
        console.error('Error fetching vouchers from Omada:', error.message);
        return null;
    }
}

module.exports = { loginToOmada, getUnusedVoucher };