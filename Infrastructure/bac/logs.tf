resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${aws_lambda_function.backend.function_name}"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "apigw" {
  name              = "/aws/http-api/${var.app_name}"
  retention_in_days = var.log_retention_days
}
