const http=require('http'),fs=require('fs'),path=require('path');
const root=__dirname;const port=process.env.PORT||4321;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
  const f=path.join(root,p);
  fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end('404');return;} res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'});res.end(d);});
}).listen(port,()=>console.log('serving on '+port));
