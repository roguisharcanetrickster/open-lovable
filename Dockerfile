FROM golang:1.23-alpine AS builder

WORKDIR /app

# The previous Dockerfile was trying to copy go.mod/go.sum but they didn't exist,
# and then it was trying to build/copy everything. 
# Let's fix the build process to match the project structure.
COPY main.go ./
RUN go mod init app || true
RUN go mod tidy || true
RUN go build -o app main.go

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/app .

EXPOSE 8080
CMD ["./app"]
