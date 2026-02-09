FROM golang:1.21-alpine

WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY . .
RUN go build -o main .

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3003/health || exit 1

CMD ["./main"]
