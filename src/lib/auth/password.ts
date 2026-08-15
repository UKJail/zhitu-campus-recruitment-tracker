export function validateNewPassword(password: string, confirmation: string) {
  if (password.length < 8) return "新密码至少需要 8 位。";
  if (password.length > 72) return "新密码不能超过 72 位。";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "新密码需要同时包含英文字母和数字。";
  if (password !== confirmation) return "两次输入的密码不一致。";
  return "";
}
