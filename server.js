const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const USERS_FILE = path.join(__dirname, 'users.json');
let otpStorage = {};

// Khởi tạo Resend với API Key từ biến môi trường trên Render
const resend = new Resend(process.env.RESEND_API_KEY);

// Công tắc bảo trì khi update hệ thống (false là chạy bình thường)
const IS_MAINTENANCE = false; 

app.use((req, res, next) => {
    if (IS_MAINTENANCE) {
        return res.send(`
            <!DOCTYPE html>
            <html lang="vi">
            <head>
                <meta charset="UTF-8">
                <title>Hệ thống đang bảo trì</title>
                <style>
                    body { background: #0f172a; color: white; font-family: Arial, sans-serif; text-align: center; padding-top: 100px; margin: 0; }
                    .box { background: #1e293b; max-width: 500px; margin: 0 auto; padding: 40px; border-radius: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); }
                    h1 { color: #f59e0b; margin-bottom: 10px; font-size: 24px; }
                    p { color: #94a3b8; font-size: 16px; line-height: 1.5; }
                </style>
            </head>
            <body>
                <div class="box">
                    <h1>🛠️ HỆ THỐNG ĐANG NÂNG CẤP</h1>
                    <p>Chúng tôi đang tiến hành cập nhật các tính năng phiên bản mới tốt hơn cho bạn.</p>
                    <p style="color: #38bdf8; font-weight: bold; margin-top: 20px;">Vui lòng quay lại sau vài phút nữa nhé!</p>
                </div>
            </body>
            </html>
        `);
    }
    next();
});

function loadUsers() {
    if (!fs.existsSync(USERS_FILE)) return [];
    try { 
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); 
    } catch (err) { 
        return []; 
    }
}

function saveUsers(users) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

// 1. API Gửi mã OTP (Nhận chính xác email người dùng nhập từ giao diện)
app.post('/api/send-otp', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ success: false, message: 'Vui lòng nhập địa chỉ email!' });
        }

        const usersDB = loadUsers();
        // Kiểm tra nếu dùng cho đăng ký mà email đã tồn tại thì báo lỗi
        // (Nếu bạn dùng chung API này cho cả quên mật khẩu thì có thể bỏ qua check tồn tại ở bước này hoặc tách riêng)

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpStorage[email] = { otp, expiresAt: Date.now() + 2 * 60 * 1000 };

        // Gửi email qua Resend sử dụng tên miền riêng của bạn
        const { error } = await resend.emails.send({
            from: 'AUDIO POOL PRO <support@audiopoolpro.io.vn>',
            to: [email],
            subject: 'Mã xác thực OTP của bạn',
            html: `<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background: #f9fafb;">
                    <h2 style="color: #7c3aed;">AUDIO POOL PRO - Xác thực tài khoản</h2>
                    <p>Mã OTP của bạn là: <strong style="font-size: 22px; color: #10b981;">${otp}</strong></p>
                    <p>Mã này có hiệu lực trong vòng 2 phút. Vui lòng không chia sẻ cho bất kỳ ai.</p>
                   </div>`
        });

        if (error) {
            return res.status(400).json({ success: false, message: 'Lỗi gửi mail: ' + error.message });
        }

        res.json({ success: true, message: 'Đã gửi mã OTP về email của bạn!' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Lỗi máy chủ: ' + error.message });
    }
});

// 2. API Đăng ký tài khoản (Mặc định gói là free)
app.post('/api/register', (req, res) => {
    const { email, otp, username, password } = req.body;
    const record = otpStorage[email];

    if (!record || record.otp !== otp || Date.now() > record.expiresAt) {
        return res.status(400).json({ success: false, message: 'Mã OTP không chính xác hoặc đã hết hạn!' });
    }

    const usersDB = loadUsers();
    if (usersDB.find(u => u.email === email)) {
        return res.status(400).json({ success: false, message: 'Email này đã được đăng ký!' });
    }
    if (usersDB.find(u => u.username === username)) {
        return res.status(400).json({ success: false, message: 'Tên đăng nhập đã tồn tại!' });
    }

    usersDB.push({ 
        username, 
        email, 
        password, 
        role: 'user', 
        package: 'free', 
        expireDate: null 
    });
    
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

    // Tự động hạ gói nếu hết hạn Pro
    if (user.package === 'pro_limited' && user.expireDate && Date.now() > new Date(user.expireDate).getTime()) {
        user.package = 'free';
        saveUsers(usersDB);
    }
    
    res.json({ 
        success: true, 
        username: user.username, 
        role: user.role, 
        package: user.package,
        expireDate: user.expireDate,
        message: 'Đăng nhập thành công!' 
    });
});

// 4. API Reset / Khôi phục mật khẩu
app.post('/api/reset-password', (req, res) => {
    const { email, otp, newPassword } = req.body;
    const record = otpStorage[email];

    if (!record || record.otp !== otp || Date.now() > record.expiresAt) {
        return res.status(400).json({ success: false, message: 'Mã OTP không chính xác hoặc đã hết hạn!' });
    }

    const usersDB = loadUsers();
    const user = usersDB.find(u => u.email === email);

    if (!user) {
        return res.status(400).json({ success: false, message: 'Email này chưa được đăng ký trong hệ thống!' });
    }

    user.password = newPassword;
    saveUsers(usersDB);
    delete otpStorage[email];

    res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
});

// 5. API Admin lấy danh sách người dùng
app.get('/api/admin/users', (req, res) => {
    const usersDB = loadUsers();
    res.json({ success: true, users: usersDB });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server đang chạy trên port ${PORT}`));