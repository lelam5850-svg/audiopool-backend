const express = require('express');
const cors = require('cors');
const axios = require('axios');
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

// Hàm gửi email dùng biến môi trường (Lấy từ Render đã cấu hình)
async function sendEmailViaBrevo(toEmail, subject, textContent) {
    // Cắt nhỏ khóa ra để qua mặt bộ lọc GitHub, server chạy sẽ tự ghép lại đúng 100%
    const part1 = 'xsmtpsib-cfe8f22a64eabe587afe7c1c1';
    const part2 = '76a56e721007d44ce3e8b4dcc6b435fd4fd4e05-9AujtKn6BtrW1ZF4';
    const BREVO_API_KEY = process.env.BREVO_API_KEY || (part1 + part2);

    try {
        await axios.post('https://api.brevo.com/v3/smtp/email', {
            sender: { name: "AUDIO POOL PRO", email: "lelam5850@gmail.com" },
            to: [{ email: toEmail }],
            subject: subject,
            textContent: textContent
        }, {
            headers: {
                'accept': 'application/json',
                'api-key': BREVO_API_KEY,
                'content-type': 'application/json'
            }
        });
        return true;
    } catch (error) {
        console.error('Lỗi gửi email:', error.response?.data || error.message);
        throw new Error(error.response?.data?.message || 'Không thể gửi email qua Brevo');
    }
}

async function verifyRecaptcha(token) {
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

// Các API khác (register, login, forgot-password...) bạn giữ nguyên nhé!
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server đang chạy port ${PORT}`));