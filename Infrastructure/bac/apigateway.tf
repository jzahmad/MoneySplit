############################################
# API Gateway v2 (HTTP API) + Cognito JWT
############################################

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

# ------------------------------------------
# HTTP API
# ------------------------------------------
resource "aws_apigatewayv2_api" "http" {
  name          = "${var.app_name}-http-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = [
    "http://localhost:5173",
    "https://staging.d3n1f6zzl37or0.amplifyapp.com"
    ]
    allow_methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 3600
  }
}

# ------------------------------------------
# Integration -> Lambda proxy (payload v2.0)
# ------------------------------------------
resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.backend.arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 29000
}

# ------------------------------------------
# Cognito JWT Authorizer
# ------------------------------------------
resource "aws_apigatewayv2_authorizer" "cognito_jwt" {
  api_id          = aws_apigatewayv2_api.http.id
  name            = "${var.app_name}-cognito-jwt"
  authorizer_type = "JWT"

  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    issuer   = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.this.id}"
    audience = [aws_cognito_user_pool_client.this.id]
  }
}

# ------------------------------------------
# Routes
# ------------------------------------------

# Public health check (no auth)
resource "aws_apigatewayv2_route" "health" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "GET /health"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"

  authorization_type = "NONE"
}

# ✅ IMPORTANT: Preflight must be unauthenticated
resource "aws_apigatewayv2_route" "api_options_proxy" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "OPTIONS /api/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"

  authorization_type = "NONE"
}

# Protected: forward /api/* to Django, require Cognito JWT
resource "aws_apigatewayv2_route" "api_proxy" {
  api_id    = aws_apigatewayv2_api.http.id
  route_key = "ANY /api/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"

  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito_jwt.id
}

# ------------------------------------------
# Stage ($default) with access logging
# ------------------------------------------
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true

  # Configure default route settings, but WITHOUT v1 caching arguments.
  default_route_settings {
    # Performance and observability settings can stay.
    throttling_burst_limit = 100
    throttling_rate_limit  = 50
    data_trace_enabled     = false
    detailed_metrics_enabled = true
  }

  # Your existing access_log_settings block stays here
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw.arn
    format = jsonencode({
      requestId               = "$context.requestId"
      sourceIp                = "$context.identity.sourceIp"
      requestTime             = "$context.requestTime"
      httpMethod              = "$context.httpMethod"
      routeKey                = "$context.routeKey"
      path                    = "$context.path"
      status                  = "$context.status"
      responseLength          = "$context.responseLength"
      integrationErrorMessage = "$context.integrationErrorMessage"
    })
  }
}