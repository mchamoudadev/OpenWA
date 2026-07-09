import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, MinLength, Matches, IsIn, IsUrl } from 'class-validator';

export class CreateSessionDto {
  @ApiProperty({
    // P3-T1 (caawiye-integration): allow underscores and up to 100 chars so the
    // Caawiye routing-key session name `caw_<tenantHex32>_<channelHex32>` (69
    // chars) validates. Matches the `sessions.name` column (varchar 100) and the
    // whatsapp-web.js LocalAuth clientId rule (`/^[-_\w]+$/`).
    description: 'Unique name for the session (letters, numbers, hyphens, and underscores)',
    example: 'my-bot',
    minLength: 3,
    maxLength: 100,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Session name can only contain letters, numbers, hyphens, and underscores',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Session configuration options',
    example: { autoReconnect: true },
  })
  @IsOptional()
  config?: Record<string, unknown>;

  // Phase 3: Proxy per session
  @ApiPropertyOptional({
    description: 'Proxy URL for this session (e.g., http://user:pass@proxy.example.com:8080)',
    example: 'http://proxy.example.com:8080',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  // Reject a malformed/non-proxy URL at the boundary (credentialed http://user:pass@host and
  // socks4/5 still validate). The host is intentionally NOT SSRF-blocked here — a per-session proxy
  // is operator-chosen egress, and a loopback proxy sidecar is a legitimate setup.
  // require_tld:false + allow_underscores:true so single-label container hostnames (e.g. `squid`,
  // `localhost`) and IP-literal proxies validate, matching the engine's URL-parse check.
  @IsUrl(
    {
      protocols: ['http', 'https', 'socks4', 'socks5'],
      require_protocol: true,
      require_tld: false,
      allow_underscores: true,
    },
    { message: 'proxyUrl must be a valid http(s)/socks4/socks5 URL' },
  )
  proxyUrl?: string;

  @ApiPropertyOptional({
    description: 'Proxy type',
    enum: ['http', 'https', 'socks4', 'socks5'],
    example: 'http',
  })
  @IsOptional()
  @IsIn(['http', 'https', 'socks4', 'socks5'])
  proxyType?: 'http' | 'https' | 'socks4' | 'socks5';
}
