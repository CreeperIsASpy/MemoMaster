// --- 0. 静默模式 (防止无黑框运行时崩溃) ---
if (process.platform === 'win32') {
    // 屏蔽控制台输出，防止在 GUI 模式下因找不到 stdout 而崩溃
    const fs = require('fs');
    try {
        const nullStream = fs.createWriteStream('log.txt');
        process.stdout.write = nullStream.write.bind(nullStream);
        process.stderr.write = nullStream.write.bind(nullStream);
        console.log = () => {}; 
        console.error = () => {};
    } catch (e) {}
}

const express = require('express');
const { exec } = require('child_process');
const app = express();
const PORT = 3000;

app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ==========================================
// 1. 前端输入界面 (GUI)
// ==========================================
const guiHTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>MemoMaster 备忘录助手</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 30px auto; padding: 20px; background: #f4f6f8; }
        .container { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
        .group { margin-bottom: 15px; }
        label { display: block; font-weight: bold; margin-bottom: 5px; color: #555; }
        input, textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; }
        textarea { height: 80px; resize: vertical; }
        button { cursor: pointer; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; color: white; transition: 0.2s; }
        #btn-add { background: #6c757d; float: right; }
        .action-bar { margin-top: 30px; display: flex; gap: 10px; border-top: 2px dashed #eee; padding-top: 20px; }
        .main-btn { flex: 1; padding: 15px; font-size: 16px; }
        #btn-preview { background: #17a2b8; }
        #btn-save { background: #28a745; }
        
        .list-box { margin-top: 50px; border: 1px solid #eee; border-radius: 6px; background: #fff; min-height: 50px; }
        .item { padding: 10px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; }
        .del { color: red; cursor: pointer; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <h2 style="text-align:center;">录入备忘录</h2>
        <div class="group">
            <label>科目</label>
            <input id="sub" maxlength="3" placeholder="如：数学">
        </div>
        <div class="group">
            <label>内容</label>
            <textarea id="con" placeholder="输入内容..."></textarea>
        </div>
        <div style="overflow:hidden;"><button id="btn-add" onclick="add()">+ 加入列表</button></div>

        <div id="list" class="list-box"><div style="text-align:center;padding:15px;color:#999">暂无内容</div></div>

        <form id="form" method="POST" target="_blank">
            <input type="hidden" name="data" id="data">
            <input type="hidden" name="mode" id="mode">
            <div class="action-bar">
                <button type="button" class="main-btn" id="btn-preview" onclick="go('preview')">仅预览</button>
                <button type="button" class="main-btn" id="btn-save" onclick="go('save')">存为 PNG</button>
            </div>
        </form>
    </div>

    <script>
        let list = [];
        function render() {
            const el = document.getElementById('list');
            if(list.length===0) return el.innerHTML='<div style="text-align:center;padding:15px;color:#999">暂无内容</div>';
            el.innerHTML = list.map((x,i) => \`<div class="item"><span>[<b>\${x.s}</b>] \${x.c.substring(0,15)}...</span><span class="del" onclick="del(\${i})">×</span></div>\`).join('');
        }
        function add() {
            const s = document.getElementById('sub').value.trim();
            const c = document.getElementById('con').value.trim();
            if(!s||!c) return alert('请填写完整');
            list.push({s,c});
            document.getElementById('sub').value='';
            document.getElementById('con').value='';
            render();
        }
        function del(i) { list.splice(i,1); render(); }
        function go(mode) {
            if(list.length===0) return alert('列表为空');
            document.getElementById('data').value = JSON.stringify(list);
            document.getElementById('mode').value = mode;
            document.getElementById('form').submit();
        }
    </script>
</body>
</html>
`;

// ==========================================
// 2. 后端逻辑 (只负责组装 HTML)
// ==========================================
app.get('/', (req, res) => res.send(guiHTML));

app.post('/', (req, res) => {
    const list = JSON.parse(req.body.data);
    const mode = req.body.mode; // 'preview' or 'save'
    
    // 1. 数据分组
    const grouped = {};
    list.forEach(item => {
        if (!grouped[item.s]) grouped[item.s] = [];
        item.c.split('\n').forEach(line => {
            if(line.trim()) grouped[item.s].push(line.trim());
        });
    });

    // 2. 生成 HTML 内容
    const dateStr = new Date().toLocaleDateString('zh-CN', {year:'numeric', month:'2-digit', day:'2-digit'});
    let contentHtml = '';
    for(let sub in grouped) {
        contentHtml += `<div class="section"><h2>${sub}</h2><ul>${grouped[sub].map(l=>`<li>${l}</li>`).join('')}</ul></div>`;
    }

    // 3. 构建返回页面
    // 关键点：如果是 'save' 模式，我们在页面底部注入 html2canvas 自动截图脚本
    const script = mode === 'save' ? `
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
        <script>
            window.onload = function() {
                // 稍微延时确保渲染完成
                setTimeout(() => {
                    const target = document.getElementById('capture-area');
                    html2canvas(target, {scale: 2, backgroundColor: '#ffffff'}).then(canvas => {
                        const link = document.createElement('a');
                        link.download = '备忘录-${dateStr}.png';
                        link.href = canvas.toDataURL();
                        link.click();
                        // 可选：下载后自动关闭窗口
                        // window.close(); 
                    });
                }, 500);
            }
        </script>
    ` : '';

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>备忘录生成</title>
        <style>
            body { background: #eef; display: flex; justify-content: center; padding-top: 20px; }
            /* 只有这个 ID 内的内容会被截图 */
            #capture-area {
                width: 400px; /* 紧凑宽度 */
                min-height: 300px;
                background: white;
                padding: 30px;
                box-shadow: 0 0 20px rgba(0,0,0,0.1);
                font-family: "Microsoft YaHei", sans-serif;
                color: #333;
                box-sizing: border-box;
            }
            h1 { font-size: 22px; text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 25px; }
            h2 { font-size: 18px; margin: 20px 0 10px 0; padding-left: 10px; border-left: 5px solid #007bff; background: #f8f8f8; line-height: 1.5; }
            ul { padding-left: 25px; margin: 0; }
            li { margin-bottom: 5px; line-height: 1.4; font-size: 15px; }
            .tip { position: fixed; top: 10px; left: 10px; background: #333; color: #fff; padding: 10px; border-radius: 5px; font-size: 12px; }
        </style>
    </head>
    <body>
        ${mode === 'save' ? '<div class="tip">正在生成图片并下载...</div>' : ''}
        
        <div id="capture-area">
            <h1># ${dateStr} 备忘录</h1>
            ${contentHtml}
        </div>

        ${script}
    </body>
    </html>`;

    res.send(html);
});

app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.log(`服务启动: ${url}`);
    exec(`start ${url}`); // Windows 启动命令
});