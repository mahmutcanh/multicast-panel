import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// Password policy: 10+ chars, at least one lower, upper and digit.
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{10,}$/;
export const PASSWORD_MESSAGE =
  'Password must be at least 10 characters and contain lowercase, uppercase and a digit';

export class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(1) @MaxLength(200) password: string;
  @IsOptional() @IsBoolean() rememberMe?: boolean;
}

export class MfaVerifyDto {
  @IsString() mfaToken: string;
  @IsString() @MinLength(6) @MaxLength(16) code: string;
}

export class MfaEnableDto {
  @IsString() @MinLength(6) @MaxLength(6) code: string;
}

export class MfaDisableDto {
  @IsString() password: string;
  @IsString() @MinLength(6) @MaxLength(16) code: string;
}

export class ForgotPasswordDto {
  @IsEmail() email: string;
}

export class ResetPasswordDto {
  @IsString() token: string;
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE }) password: string;
}

export class ChangePasswordDto {
  @IsString() currentPassword: string;
  @Matches(PASSWORD_REGEX, { message: PASSWORD_MESSAGE }) newPassword: string;
}
