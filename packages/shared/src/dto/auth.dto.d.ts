export declare class SendOtpDto {
    phone: string;
    type?: string;
    companyNationalId?: string;
}
export declare class VerifyOtpDto {
    phone: string;
    code: string;
    type?: string;
    companyNationalId?: string;
}
export declare class SetPasswordDto {
    tempToken: string;
    password: string;
    referralCode?: string;
}
export declare class LoginDto {
    phone: string;
    password: string;
}
export declare class ForgotPasswordDto {
    phone: string;
}
export declare class ResetPasswordDto {
    resetToken: string;
    password: string;
}
export declare class RefreshTokenDto {
    refreshToken: string;
}

