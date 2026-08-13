const express = require('express');
const cors = require('cors');
const SibApiV3Sdk = require('sib-api-v3-sdk');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const USERS_FILE = path.join(__dirname, 'users.json');
let otpStorage = {};

function loadUsers() {
    if (!fs.existsSync(USERS_FILE)) {
        const defaultUsers = [
            { username: 'admin', email: 'lelam5850@gmail.com', password: '123', role: 'admin' }
        ];
        fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2), 'utf8');
        return defaultUsers;
    }
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return [{ username: 'admin', email: 'lelam5850@gmail.com', password: '123', role: 'admin' }];
    }
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

let usersDB = loadUsers();

// Hàm gửi email giao dịch (OTP) chính thức dùng SDK của Brevo
async function sendEmailViaBrevo(toEmail, subject, textContent) {
    let defaultClient = SibApiV3Sdk.ApiClient.instance;
    let apiKey = defaultClient.authentications['api-key'];
    
    // Gán API Key xkeysib-... chuẩn của bạn vào đây
    apiKey.apiKey = 'xkeysib-cfe8f22a64eabe587afe7c1c176a56e721007d44ce3e8b4dcc6b435fd4fd4e05-hnRHP1vYSEsWWaE';

    let apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
    let sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    sendSmtpEmail.subject = subject;
    sendSmtpEmail.textContent = textContent;
    sendSmtpEmail.sender = { name: "AUDIO POOL PRO", email: "lelam5850@gmail.com" };
    sendSmtpEmail.to = [{ email: toEmail }];

    try {
        await apiInstance.sendTransacEmail(sendSmtpEmail);
        return true;
    } catch (error) {
        console.error('Lỗi gửi email Brevo:', error.response?.text || error.message);
        throw new Error('Không thể gửi email qua Brevo');
    }
}

async function verifyRecaptcha(token) {
    const axios = require('axios');
    const secretKey = '6Lflpn8tAAAAAHaCwA_9iE0bj23_2EF8TbhUy6MG';
    try {
        const response = await axios.post(`https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`);
        return response.data.success;
    } catch (error) {
        return false;
    }
}

app.post('/api/send-otp', async (req, res) => {
    try {
        const { email, recaptchaToken } = req.body;
        const isHuman = await verifyRecaptcha(recaptchaToken);
        if (!isHuman) return res.status(400).json({ success: false, message: 'Xác thực Captcha thất bại!' });

        usersDB = loadUsers();
        if (usersDB.find(u => u.email === email)) return res.status(400).json({ success: false, message: 'Email đã tồn tại!' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpStorage[email] = { otp, expiresAt: Date.now() + 2 * 60 * 1000 };

        await sendEmailViaBrevo(email, 'Mã xác thực AUDIO POOL PRO', `Mã OTP của bạn là: ${otp}`);
        res.json({ success: true, message: 'Đã gửi mã OTP!' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/register', (req, res) => {
    const { email, otp, username, password } = req.body;
    const record = otpStorage[email];
    if (!record || record.otp !== otp || Date.now() > record.expiresAt) return res.status(400).json({ success: false, message: 'OTP sai hoặc hết hạn!' });

    usersDB = loadUsers();
    usersDB.push({ username, email, password, role: 'user' });
    saveUsers(usersDB);
    delete otpStorage[email];
    res.json({ success: true, message: 'Đăng ký thành công!' });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    usersDB = loadUsers();
    const user = usersDB.find(u => (u.username === username || u.email === username) && u.password === password);
    if (!user) return res.status(400).json({ success: false, message: 'Sai thông tin!' });
    res.json({ success: true, username: user.username, role: user.role });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server đang chạy port ${PORT}`));