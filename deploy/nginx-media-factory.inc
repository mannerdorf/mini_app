# Narrow legacy CMS routes only; include within each API server block.
location ^~ /api/admin-content-editor {
    proxy_pass http://127.0.0.1:3000/api/admin-factory-editor;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 5s;
    proxy_read_timeout 20s;
}
location ^~ /api/admin-media-plans-generate {
    default_type application/json;
    return 410 '{"error":"Use the source-verified generation queue"}';
}
