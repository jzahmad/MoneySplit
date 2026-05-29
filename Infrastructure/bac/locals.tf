locals {
  # ✅ your real backend root (inside Backend/)
  backend_root_dir = "${path.module}/../../Backend/django-lambda"

  lambda_build_dir = "${path.module}/build/lambda_pkg"
  lambda_zip_path  = "${path.module}/build/lambda.zip"

  # ✅ handler lives here
  lambda_src_dir = "${local.backend_root_dir}/lambda_src"

  # ✅ where requirements.txt is (choose one that you actually have)
  requirements_path = "${local.backend_root_dir}/requirements.txt"
}
