const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const USERS_FILE = path.join(__dirname, 'users.json');
let otpStorage = {};

const resend = new Resend(process.env.RESEND_API_KEY);

function loadUsers() {
    if (!fs.existsSync(USERS_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } 
    catch (err) { return []; }
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

// Hàm kiểm tra Google reCAPTCHA
async function verifyRecaptcha(token) {
    const secretKey = '6Lflpn8tAAAAAHaCwA_9iE0bj23_2EF8TbhUy6MG';
    try {
        const response = await axios.post(`https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${token}`);
        return response.data.success;
    } catch (error) {
        return false;
    }
}

// 1. API Gửi OTP (Có tích hợp reCAPTCHA)
app.post('/api/send-otp', async (req, res) => {
    try {
        const { email, recaptchaToken } = req.body;
        
        // Kiểm tra Captcha
        const isHuman = await verifyRecaptcha(recaptchaToken);
        if (!isHuman) {
            return res.status(400).json({ success: false, message: 'Xác thực Captcha thất bại!' });
        }

        const usersDB = loadUsers();
        if (usersDB.find(u => u.email === email)) {
            return res.status(400).json({ success: false, message: 'Email đã tồn tại trong hệ thống!' });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpStorage[email] = { otp, expiresAt: Date.now() + 2 * 60 * 1000 };

        const { error } = await resend.emails.send({
            from: 'AUDIO POOL PRO <support@audiopoolpro.io.vn>',
            to: [email],
            subject: 'Mã xác thực OTP của bạn',
            html: `<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                    <h2 style="color: #8b5cf6;">Mã xác thực AUDIO POOL PRO</h2>
                    <p>Mã OTP của bạn là: <strong style="font-size: 22px; color: #10b981;">${otp}</strong></p>
                    <p>Mã này có hiệu lực trong vòng 2 phút.</p>
                   </div>`
        });

        if (error) throw new Error(error.message);
        res.json({ success: true, message: 'Mã OTP đã được gửi về email của bạn!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Không thể gửi email: ' + error.message });
    }
});

// 2. API Đăng ký
app.post('/api/register', (req, res) => {
    const { email, otp, username, password } = req.body;
    const record = otpStorage[email];

    if (!record || record.otp !== otp || Date.now() > record.expiresAt) {
        return res.status(400).json({ success: false, message: 'Mã OTP không chính xác hoặc đã hết hạn!' });
    }

    const usersDB = loadUsers();
    usersDB.push({ username, email, password, role: 'user' });
    saveUsers(usersDB);
    
    delete otpStorage[email];
    res.json({ success: true, message: 'Đăng ký tài khoản thành công!' });
});

// 3. API Đăng nhập
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const usersDB = loadUsers();
    const user = usersDB.find(u => (u.username === username || u.email === username) && u.password === password);
    
    if (!user) {
        return res.status(400).json({ success: false, message: 'Sai tên đăng nhập hoặc mật khẩu!' });
    }
    
    res.json({ success: true, username: user.username, role: user.role, message: 'Đăng nhập thành công!' });
});

// 4. API Dành cho Admin lấy danh sách tài khoản
app.get('/api/admin/users', (req, res) => {
    const usersDB = loadUsers();
    res.json({ success: true, users: usersDB });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server đang chạy trên port ${PORT}`));