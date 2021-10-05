# C언어 HTTP 서버

## 목표

- C언어 기반 HTTP 서버 작성해보기

## 순서

- socket(), bind(), listen() 등을 활용하여 TCP 소켓을 준비한다.
- accept() 후에 HTTP 프로토콜로 처리하는 함수를 준비한다.
- 처리 중 에러가 발생하면 404, 500의 상태 코드로 응답한다.

## 전체 코드

```c
#define BUF_SIZE 1000
#define HEADER_FMT "HTTP/1.1 %d %s\nContent-Length: %ld\nContent-Type: %s\n\n"
#define NOT_FOUND_CONTENT "<h1>404 Not Found</h1>\n"
#define SERVER_ERROR_CONTENT "<h1>500 Internal Server Error</h1>\n"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>
#include <fcntl.h>
#include <signal.h>
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/socket.h>
#include <arpa/inet.h>
/*
@func assign address to the created socket lsock(sd)
@return bind() return value
*/
int bind_lsock(int lsock, int port) {
    struct sockaddr_in sin;

    sin.sin_family = AF_INET;
    sin.sin_addr.s_addr = htonl(INADDR_ANY);
    sin.sin_port = htons(port);

    return bind(lsock, (struct sockaddr *)&sin, sizeof(sin));
}

void fill_header(char *header, int status, long len, char *type) {
    char status_text[40];

    switch (status) {
        case 200:
            strcpy(status_text, "OK");
            break;
        case 404:
            strcpy(status_text, "Not Found");
            break;
        case 500:
        default:
            strcpy(status_text, "Internal Server Error");
            break;
    }
    sprintf(header, HEADER_FMT, status, status_text, len, type);
}

/* @func find content type from uri @return */
void find_mime(char *ct_type, char *uri) {
    char *ext = strrchr(uri, '.');
    if (!strcmp(ext, ".html"))
        strcpy(ct_type, "text/html");
    else if (!strcmp(ext, ".jpg") || !strcmp(ext, ".jpeg"))
        strcpy(ct_type, "image/jpeg");
    else if (!strcmp(ext, ".png"))
        strcpy(ct_type, "image/png");
    else if (!strcmp(ext, ".css"))
        strcpy(ct_type, "text/css");
    else if (!strcmp(ext, ".js"))
        strcpy(ct_type, "text/javascript");
    else
        strcpy(ct_type, "text/plain");
}

/* @func handler for not found @return */
void handle_404(int asock) {
    char header[BUF_SIZE];
    fill_header(header, 404, sizeof(NOT_FOUND_CONTENT), "text/html");
    write(asock, header, strlen(header));
    write(asock, NOT_FOUND_CONTENT, sizeof(NOT_FOUND_CONTENT));
}

/* @func handler for internal server error @return */
void handle_500(int asock) {
    char header[BUF_SIZE];
    fill_header(header, 500, sizeof(SERVER_ERROR_CONTENT), "text/html");

    write(asock, header, strlen(header));
    write(asock, SERVER_ERROR_CONTENT, sizeof(SERVER_ERROR_CONTENT));
}

/* @func main http handler; try to open and send requested resource, calls error handler on failure @return */
void http_handler(int asock) {
    char header[BUF_SIZE];
    char buf[BUF_SIZE];

    if (read(asock, buf, BUF_SIZE) < 0) {
        perror("[ERR] Failed to read request.\n");
        handle_500(asock);
        return;
    }

    char *method = strtok(buf, " ");
    char *uri = strtok(NULL, " ");
    if (method == NULL || uri == NULL) {
        perror("[ERR] Failed to identify method, URI.\n");
        handle_500(asock);
        return;
    }

    printf("[INFO] Handling Request: method=%s, URI=%s\n", method, uri);

    char safe_uri[BUF_SIZE];
    char *local_uri;
    struct stat st;

    strcpy(safe_uri, uri);
    if (!strcmp(safe_uri, "/"))
        strcpy(safe_uri, "/index.html");

    local_uri = safe_uri + 1;
    if (stat(local_uri, &st) < 0) {
        perror("[WARN] No file found matching URI.\n");
        handle_404(asock);
        return;
    }

    int fd = open(local_uri, O_RDONLY);
    if (fd < 0) {
        perror("[ERR] Failed to open file.\n");
        handle_500(asock);
        return;
    }

    int ct_len = st.st_size;
    char ct_type[40];
    find_mime(ct_type, local_uri);
    fill_header(header, 200, ct_len, ct_type);
    write(asock, header, strlen(header));

    int cnt;
    while ((cnt = read(fd, buf, BUF_SIZE)) > 0)
        write(asock, buf, cnt);
}

int main(int argc, char **argv) {
    int port, pid;
    int lsock, asock;

    struct sockaddr_in remote_sin;
    socklen_t remote_sin_len;

    if (argc < 2) {
        printf("Usage: \n");
        printf("\t%s {port}: runs mini HTTP server.\n", argv[0]);
        exit(0);
    }

    port = atoi(argv[1]);
    printf("[INFO] The server will listen to port: %d.\n", port);

    lsock = socket(AF_INET, SOCK_STREAM, 0);
    if (lsock < 0) {
        perror("[ERR] failed to create lsock.\n");
        exit(1);
    }
    if (bind_lsock(lsock, port) < 0) {
        perror("[ERR] failed to bind lsock.\n");
        exit(1);
    }
    if (listen(lsock, 10) < 0) {
        perror("[ERR] failed to listen lsock.\n");
        exit(1);
    }
    // to handle zombie process
    struct sigaction sa;
    sa.sa_handler = SIG_IGN;
    sa.sa_flags = 0;
    sigaction(SIGCHLD, &sa, NULL);

    while (1) {
        printf("[INFO] waiting...\n");
        asock = accept(lsock, (struct sockaddr *)&remote_sin, &remote_sin_len);
        if (asock < 0) {
            perror("[ERR] failed to accept.\n");
            continue;
        }

        pid = fork();
        if (pid == 0) {  // 자식 프로세스
            close(lsock);
            http_handler(asock);
            close(asock);
            exit(0);
        }
        if (pid != 0) { // 부모 프로세스
            close(asock);
        }
        if (pid < 0) {
            perror("[ERR] failed to fork.\n");
        }
    }
}
```

## 테스트용 웹

### index.html

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <title></title>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link href="./index.css" rel="stylesheet" />
  </head>
  <body>
    <h1>Test Page</h1>
    <button id="btn">button</button>
    <div id="result"></div>
    <script src="./index.js"></script>
  </body>
</html>
```

### index.css

```css
body {
  text-align: center;
}

button {
  width: 100px;
  margin-bottom: 20px;
}
```

### index.js

```jsx
let btn = document.getElementById("btn");
let result = document.getElementById("result");

function handleClick() {
  result.textContent = "Clicked";
}

btn.addEventListener("click", handleClick);
```

## 결과

![스크린샷 2021-10-05 오후 5 13 07](https://user-images.githubusercontent.com/74812188/135986374-15ad3f5f-7029-4c58-aa51-3e9e02835ced.png)

![스크린샷 2021-10-05 오후 5 16 15](https://user-images.githubusercontent.com/74812188/135986397-1970ca30-0a45-4db4-8895-bc0440598bbe.png)

[localhost:8000](http://localhost:8000) 으로 접속하면 다음과 같은 웹을 확인할 수 있다.

index.html, index.css, index.js 모두 정상적으로 적용된다.
