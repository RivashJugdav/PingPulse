# SSL/TLS Configuration Guide

This document outlines the SSL/TLS configuration for our application and provides best practices for maintaining secure communication.

## Configuration Overview

Our application uses modern SSL/TLS configurations to ensure secure communication:

- **TLS Version**: Minimum TLS 1.2, with preference for TLS 1.3
- **Strong Ciphers**: Only high-security ciphers are enabled
- **HSTS**: Strict Transport Security enforced
- **Certificate Management**: Regular rotation and monitoring

## Development Setup

For development purposes, self-signed certificates are used. These should **NEVER** be used in production.

### Generating Development Certificates

Run the following command to generate self-signed certificates for local development:

```bash
npm run generate:certs
```

This creates:
- `ssl/private.key` - Private key
- `ssl/certificate.crt` - Self-signed certificate

### Running with HTTPS in Development

Use the following command to start the server with HTTPS enabled:

```bash
npm run dev:https
```

## Production Configuration

For production, obtain certificates from a trusted Certificate Authority (CA) like Let's Encrypt.

### Certificate Requirements

- **Key Size**: Minimum 2048 bits (4096 recommended)
- **Signature Algorithm**: SHA-256 or stronger
- **Certificate Chain**: Include complete certificate chain
- **Validity Period**: 1 year maximum (90 days recommended)

### Recommended CA Providers

- [Let's Encrypt](https://letsencrypt.org/) (Free, automated)
- [Sectigo](https://sectigo.com/)
- [DigiCert](https://www.digicert.com/)

### Server Configuration

In production, update the `.env` file:

```
USE_HTTPS=true
SSL_KEY_PATH=/path/to/production/private.key
SSL_CERT_PATH=/path/to/production/certificate.crt
SSL_CA_PATH=/path/to/production/ca_bundle.crt
```

## Cipher Configuration

Our TLS configuration uses the following secure ciphers:

```
TLS_AES_256_GCM_SHA384
TLS_CHACHA20_POLY1305_SHA256
TLS_AES_128_GCM_SHA256
ECDHE-RSA-AES256-GCM-SHA384
ECDHE-RSA-AES128-GCM-SHA256
ECDHE-RSA-CHACHA20-POLY1305
```

These ciphers provide strong encryption while maintaining compatibility with modern browsers.

## Security Headers

The application sets the following security headers for HTTPS connections:

- `Strict-Transport-Security`: Forces HTTPS connections
- `Content-Security-Policy`: Controls resource loading
- `Referrer-Policy`: Controls referrer information
- `X-Content-Type-Options`: Prevents MIME-type sniffing
- `X-Frame-Options`: Prevents clickjacking
- `X-XSS-Protection`: Additional XSS protection

## Certificate Monitoring

Regularly monitor certificates for:

- Expiration dates
- Revocation status
- Compliance with security standards
- Algorithm strength

## Best Practices

1. **Regular Updates**: Keep TLS libraries and configurations updated
2. **Certificate Rotation**: Rotate certificates regularly
3. **Private Key Protection**: Restrict access to private keys
4. **Testing**: Use tools like [SSL Labs](https://www.ssllabs.com/ssltest/) to verify configuration
5. **Monitoring**: Set up alerts for certificate expiration
6. **Protocol Disabling**: Disable SSLv2, SSLv3, TLS 1.0, and TLS 1.1

## Troubleshooting

### Common Issues

1. **Certificate Chain Problems**: Ensure the full certificate chain is included
2. **Private Key Mismatch**: Verify the certificate and private key match
3. **Cipher Compatibility**: If older clients need support, carefully adjust cipher suites

### Verification Tools

- [SSL Labs Server Test](https://www.ssllabs.com/ssltest/)
- [Qualys SSL Checker](https://www.ssllabs.com/ssltest/)
- OpenSSL command line: `openssl s_client -connect example.com:443 -tls1_2` 