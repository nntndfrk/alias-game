# Build stage
FROM rust:1.82-alpine AS builder

# Install build dependencies
RUN apk add --no-cache musl-dev pkgconfig openssl-dev

WORKDIR /app

# Copy workspace manifests
COPY Cargo.toml Cargo.lock ./

# Copy crate manifests
COPY crates/api-gateway/Cargo.toml ./crates/api-gateway/
COPY crates/game-engine/Cargo.toml ./crates/game-engine/
COPY crates/auth-service/Cargo.toml ./crates/auth-service/
COPY crates/shared/Cargo.toml ./crates/shared/

# Copy bin manifests
COPY bin/migrate/Cargo.toml ./bin/migrate/
COPY bin/seed-words/Cargo.toml ./bin/seed-words/

# Create dummy source files to build dependencies
RUN mkdir -p crates/api-gateway/src && echo "fn main() {}" > crates/api-gateway/src/main.rs && \
    mkdir -p crates/game-engine/src && echo "" > crates/game-engine/src/lib.rs && \
    mkdir -p crates/auth-service/src && echo "" > crates/auth-service/src/lib.rs && \
    mkdir -p crates/shared/src && echo "" > crates/shared/src/lib.rs && \
    mkdir -p bin/migrate/src && echo "fn main() {}" > bin/migrate/src/main.rs && \
    mkdir -p bin/seed-words/src && echo "fn main() {}" > bin/seed-words/src/main.rs

# Build dependencies
RUN cargo build --release -p api-gateway && \
    rm -rf crates/*/src bin/*/src

# Copy source code
COPY crates ./crates
COPY bin ./bin

# Build the application
RUN cargo build --release -p api-gateway

# Runtime stage
FROM alpine:3.19

# Install runtime dependencies
RUN apk add --no-cache ca-certificates

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/target/release/api-gateway /app/

# Create a non-root user
RUN addgroup -g 1000 -S appuser && \
    adduser -u 1000 -S appuser -G appuser

# Change ownership
RUN chown -R appuser:appuser /app

USER appuser

# Expose port
EXPOSE 3000

# Run the binary
CMD ["./api-gateway"]