output "api_url" {
  value = aws_apigatewayv2_api.http.api_endpoint
}

output "health_url" {
  value = "${aws_apigatewayv2_api.http.api_endpoint}/health"
}

output "api_base_url" {
  value = "${aws_apigatewayv2_api.http.api_endpoint}/api"
}

output "rds_endpoint" {
  value = aws_db_instance.mysql.address
}

output "vpc_id" {
  value = aws_vpc.main.id
}