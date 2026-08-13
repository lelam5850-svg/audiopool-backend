const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const USERS_FILE = path.join(__dirname, 'users.json');
let otpStorage = {};

// Cấu hình Nodemailer dùng Gmail SMTP (phiên bản gốc)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'lelam5850@gmail.com', // Email của bạn
        pass: 'erab pyyn vprn dkkf' // Mật khẩu ứng dụng (App Password) 16 ký tự của Gmail
    }
});

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

        // Gửi mail qua Gmail SMTP gốc
        await transporter.sendMail({
            from: '"AUDIO POOL PRO" <lelam5850@gmail.com>',
            to: email,
            subject: 'Mã xác thực AUDIO POOL PRO',
            html: `<h3>Mã OTP của bạn là: <b>${otp}</b></h3><p>Mã có hiệu lực trong 2 phút.</p>`
        });

        res.json({ success: true, message: 'Đã gửi mã OTP thành công!' });
    } catch (error) {
        console.error('Lỗi gửi email Gmail:', error);
        res.status(500).json({ success: false, message: 'Không thể gửi email: ' + error.message });
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
    if (!user) return res.status(400).json({ success: false, message: 'Sai thông tin đăng nhập!' });
    res.json({ success: true, username: user.username, role: user.role, message: 'Đăng nhập thành công!' });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server đang chạy port ${PORT}`));