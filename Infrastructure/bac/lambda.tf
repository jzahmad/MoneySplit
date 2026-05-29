resource "null_resource" "build_lambda" {
  triggers = {
    # Rebuild ONLY when backend code or requirements change
    src_hash = sha256(join("", [
      for f in fileset(local.backend_root_dir, "**/*") :
      filesha256("${local.backend_root_dir}/${f}")
    ]))
  }

  provisioner "local-exec" {
    interpreter = ["PowerShell", "-Command"]
    command = <<EOT
      New-Item -ItemType Directory -Force -Path "${local.lambda_build_dir}" | Out-Null
      Remove-Item -Recurse -Force "${local.lambda_build_dir}\\*" -ErrorAction SilentlyContinue

      Copy-Item -Recurse -Force "${local.backend_root_dir}\\*" "${local.lambda_build_dir}\\"
      Copy-Item -Force "${local.lambda_src_dir}\\lambda_src.py" "${local.lambda_build_dir}\\lambda_src.py"

      if (Test-Path "${local.requirements_path}") {
        python -m pip install --upgrade pip
        python -m pip install -r "${local.requirements_path}" -t "${local.lambda_build_dir}"
      }
    EOT
  }
}



data "archive_file" "lambda_zip" {
  type        = "zip"
  source_dir  = local.lambda_build_dir
  output_path = local.lambda_zip_path
  depends_on  = [null_resource.build_lambda]
}

variable "cognito_pool" {
  default = "us-east-1_kPz74WmSI"
}
resource "aws_lambda_function" "backend" {
  function_name    = "${var.app_name}-backend"
  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  runtime = "python3.11"
  handler = "lambda_src.handler"

  role        = data.aws_iam_role.this.arn
  timeout     = 30
  memory_size = 1024

  # ✅ Put Lambda in same VPC as RDS (private subnets)
  vpc_config {
    subnet_ids         = aws_subnet.private[*].id
    security_group_ids = [aws_security_group.lambda_sg.id]
  }

  # ✅ Provide DB config to Django via env vars
  environment {
    variables = {
      DB_HOST     = aws_db_instance.mysql.address
      DB_NAME     = var.db_name
      DB_USER     = var.db_username
      DB_PASSWORD = var.db_password
      DB_PORT     = "3306"
      COGNITO_USER_POOL_ID=var.cognito_pool

    }
  }
}
# Allow API Gateway to invoke the lambda
resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.backend.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}

# resource "aws_lambda_provisioned_concurrency_config" "backend" {
#   function_name                     = aws_lambda_function.backend.function_name
#   provisioned_concurrent_executions = 2
#   qualifier                         = aws_lambda_function.backend.version
# }
