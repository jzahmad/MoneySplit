resource "aws_cognito_user_pool" "this" {
  name = "${var.app_name}-user-pool"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = 8
    require_uppercase = true
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
  }

  tags = { App = var.app_name }
}

resource "aws_cognito_user_pool_client" "this" {
  name         = "${var.app_name}-client"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  supported_identity_providers         = ["COGNITO"]

  allowed_oauth_scopes = ["openid", "email", "profile"]

  callback_urls = ["https://staging.d3n1f6zzl37or0.amplifyapp.com/dashboard"]
  logout_urls   = ["https://staging.d3n1f6zzl37or0.amplifyapp.com/"]


  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_pool_domain" "this" {
  domain       = "moneysplit-auth-domain"
  user_pool_id = aws_cognito_user_pool.this.id
}


