const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const upload = multer({ dest: 'temp_uploads/' });
const adminPassword = 'ponta/root';
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/browse', express.static(__dirname, { index: 'index.html' }));  // index.htmlをウェブから開けるように設定
// Expressのミドルウェアとして静的ファイルを提供
app.use(express.static(__dirname));  // Node.jsが動作しているディレクトリ全体を公開

let currentFolder = ''; // 開いているフォルダ（クライアント側でも追跡）

// フォルダ作成
app.post('/createFolder', (req, res) => {
  const folderName = req.body.folderName;
  const folderPath = path.join(__dirname, 'uploads', currentFolder, folderName);

  if (!folderName) return res.status(400).json({ message: 'フォルダ名が必要です' });

  fs.mkdir(folderPath, { recursive: true }, (err) => {
    if (err) return res.status(500).json({ message: 'フォルダ作成失敗' });
    res.json({ message: 'フォルダ作成成功' });
  });
});

// ファイルリスト
app.get('/files', (req, res) => {
  const folder = req.query.folder || '';
  const dirPath = path.join(__dirname, 'uploads', folder);

  fs.readdir(dirPath, (err, files) => {
    if (err) return res.status(500).json({ message: 'ディレクトリ読み込み失敗' });
    const fileList = files.map(file => {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        isFolder: stats.isDirectory()
      };
    });
    res.json(fileList);
  });
});

// ファイルアップロード（進行状況）
app.post('/upload', upload.single('file'), (req, res) => {
  const folder = req.body.folder || '';
  const tempPath = req.file.path;
  const targetPath = path.join(__dirname, 'uploads', folder, req.file.originalname);

  fs.rename(tempPath, targetPath, (err) => {
    if (err) return res.status(500).json({ message: 'アップロード失敗' });
    fs.stat(targetPath, (err, stats) => {
      if (err) return res.status(500).json({ message: 'ファイル情報取得失敗' });
      res.json({ name: req.file.originalname, size: stats.size });
    });
  });
});

// ファイル削除
app.delete('/delete/:filename', (req, res) => {
  const folder = req.query.folder || '';
  const filePath = path.join(__dirname, 'uploads', folder, req.params.filename);

  fs.rm(filePath, { recursive: true, force: true }, (err) => {
    if (err) return res.status(500).json({ message: '削除失敗' });
    res.json({ message: '削除成功' });
  });
});

// ファイルリネーム
app.post('/rename/:filename', (req, res) => {
  const folder = req.query.folder || '';
  const oldPath = path.join(__dirname, 'uploads', folder, req.params.filename);
  const newPath = path.join(__dirname, 'uploads', folder, req.body.newName);

  fs.rename(oldPath, newPath, (err) => {
    if (err) return res.status(500).json({ message: '名前変更失敗' });
    fs.stat(newPath, (err, stats) => {
      if (err) return res.status(500).json({ message: 'ファイル情報取得失敗' });
      res.json({ name: req.body.newName, size: stats.size });
    });
  });
});

// ファイルダウンロード
app.get('/download/:filename', (req, res) => {
  const folder = req.query.folder || '';
  const filePath = path.join(__dirname, 'uploads', folder, req.params.filename);
  res.download(filePath);
});

// HTML画面
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="UTF-8">
      <title>サポートスルーヨファイルツール</title>
      <style>
        body { font-family: Arial; background: #001f3f; color: white; margin: 0; padding: 0; }
        .container { max-width: 800px; margin: 30px auto; padding: 20px; background: #003366; border-radius: 8px; }
        h1, h2 { text-align: center; color: #FFDC00; }
        #admin-mode-btn { position: absolute; top: 10px; right: 10px; background: #FF4136; border: none; padding: 8px 16px; border-radius: 4px; color: white; cursor: pointer; }
        table { width: 100%; margin-top: 20px; border-collapse: collapse; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #0074D9; }
        button { background: #FF4136; border: none; padding: 8px 12px; color: white; border-radius: 4px; margin: 2px; }
        progress { width: 100%; display: none; }
      </style>
    </head>
    <body>
      <div class="container">
        <button id="admin-mode-btn">管理モード</button>
        <h1>サポートスルーヨファイルツール</h1>

        <form id="upload-form" enctype="multipart/form-data">
          <input type="file" name="file" required>
          <button type="submit">アップロード</button>
        </form>
        <progress id="upload-progress" value="0" max="100"></progress>
        <div id="upload-percent" style="text-align:center;"></div>

        <button onclick="goHome()" style="margin-top: 10px;">ホームに戻る</button>

        <h2>ファイルリスト</h2>
        <table>
          <thead><tr><th>ファイル名</th><th>サイズ</th><th>操作</th></tr></thead>
          <tbody id="file-table"></tbody>
        </table>

        <h2>フォルダ作成</h2>
        <form id="create-folder-form">
          <input type="text" id="folder-name" required placeholder="フォルダ名">
          <button type="submit">作成</button>
        </form>
      </div>

      <script>
        let isAdmin = false;
        let currentFolder = '';

        function loadFiles() {
          fetch('/files?folder=' + encodeURIComponent(currentFolder))
            .then(res => res.json())
            .then(files => {
              const tbody = document.getElementById('file-table');
              tbody.innerHTML = '';
              files.forEach(file => {
                const tr = document.createElement('tr');
                let buttons = file.isFolder
                  ? \`<button onclick="openFolder('\${file.name}')">開く</button>\`
                  : \`<a href="/download/\${file.name}?folder=\${currentFolder}"><button>DL</button></a>\`;
                if (isAdmin) {
                  buttons += \`
                    <button onclick="renameFile('\${file.name}')">名前変更</button>
                    <button onclick="deleteFile('\${file.name}')">削除</button>
                  \`;
                }
                tr.innerHTML = \`
                  <td>\${file.name}</td>
                  <td>\${file.size}</td>
                  <td>\${buttons}</td>
                \`;
                tbody.appendChild(tr);
              });
            });
        }

        function openFolder(name) {
          currentFolder = currentFolder ? currentFolder + '/' + name : name;
          loadFiles();
        }

        function deleteFile(name) {
          fetch('/delete/' + encodeURIComponent(name) + '?folder=' + encodeURIComponent(currentFolder), {
            method: 'DELETE'
          }).then(loadFiles);
        }

        function renameFile(name) {
          const newName = prompt('新しい名前:', name);
          if (newName) {
            fetch('/rename/' + encodeURIComponent(name) + '?folder=' + encodeURIComponent(currentFolder), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ newName })
            }).then(loadFiles);
          }
        }

        document.getElementById('upload-form').addEventListener('submit', e => {
          e.preventDefault();
          const formData = new FormData(e.target);
          formData.append('folder', currentFolder);

          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/upload');

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percent = Math.round((event.loaded / event.total) * 100);
              document.getElementById('upload-progress').style.display = 'block';
              document.getElementById('upload-progress').value = percent;
              document.getElementById('upload-percent').innerText = percent + '%';
            }
          };

          xhr.onload = () => {
            e.target.reset();
            document.getElementById('upload-progress').style.display = 'none';
            document.getElementById('upload-percent').innerText = '';
            loadFiles();
          };

          xhr.send(formData);
        });

        document.getElementById('create-folder-form').addEventListener('submit', e => {
          e.preventDefault();
          const folderName = document.getElementById('folder-name').value;
          fetch('/createFolder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderName, currentFolder })
          }).then(() => { document.getElementById('folder-name').value = ''; loadFiles(); });
        });

        document.getElementById('admin-mode-btn').addEventListener('click', () => {
          if (!isAdmin) {
            const pwd = prompt('パスワードを入力');
            if (pwd === 'ponta/root') {
              isAdmin = true;
              alert('管理モードON');
            } else {
              alert('パスワードエラー');
            }
          } else {
            isAdmin = false;
            alert('管理モードOFF');
          }
          loadFiles();
        });

        function goHome() {
          currentFolder = '';
          loadFiles();
        }

        loadFiles();
      </script>
    </body>
    </html>
  `);
});

app.listen(3000, () => {
  console.log('http://localhost:3000 で起動中...');
});
