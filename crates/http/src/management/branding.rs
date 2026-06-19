/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

use common::{Server, auth::AccessToken};
use directory::{
    Permission, QueryParams, Type,
    backend::internal::{
        PrincipalField,
        lookup::DirectoryStore,
        manage::{self, ManageDirectory},
    },
};
use http_proto::*;
use hyper::Method;
use serde::Serialize;
use serde_json::json;
use std::future::Future;
use trc::AddContext;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrandingResponse {
    pub brand_name: Option<String>,
    pub brand_logo_url: Option<String>,
    pub brand_theme: Option<String>,
    pub tenant_name: Option<String>,
}

pub trait BrandingManager: Sync + Send {
    fn handle_manage_branding(
        &self,
        req: &HttpRequest,
        path: Vec<&str>,
        access_token: &AccessToken,
    ) -> impl Future<Output = trc::Result<HttpResponse>> + Send;
}

impl BrandingManager for Server {
    async fn handle_manage_branding(
        &self,
        req: &HttpRequest,
        path: Vec<&str>,
        access_token: &AccessToken,
    ) -> trc::Result<HttpResponse> {
        match (path.get(1).copied(), req.method()) {
            (None, &Method::GET) => {
                access_token.assert_has_permission(Permission::TenantGet)?;

                let tenant_id = access_token.tenant.map(|t| t.id).ok_or_else(|| {
                    manage::error("No tenant context", Some("User is not scoped to a tenant"))
                })?;

                let principal = self
                    .store()
                    .query(QueryParams::id(tenant_id).with_return_member_of(false))
                    .await?
                    .ok_or_else(|| trc::ManageEvent::NotFound.into_err())?;

                if principal.typ != Type::Tenant {
                    return Err(manage::error(
                        "Invalid tenant",
                        Some("Principal is not a tenant"),
                    ));
                }

                let mapped = self
                    .core
                    .storage
                    .data
                    .map_principal(
                        principal,
                        &[
                            PrincipalField::Name,
                            PrincipalField::BrandName,
                            PrincipalField::BrandLogoUrl,
                            PrincipalField::BrandTheme,
                        ],
                    )
                    .await
                    .caused_by(trc::location!())?;

                let brand_name = mapped
                    .get_str(PrincipalField::BrandName)
                    .map(|s| s.to_string());
                let brand_logo_url = mapped
                    .get_str(PrincipalField::BrandLogoUrl)
                    .map(|s| s.to_string());
                let brand_theme = mapped
                    .get_str(PrincipalField::BrandTheme)
                    .map(|s| s.to_string());
                let tenant_name = mapped.get_str(PrincipalField::Name).map(|s| s.to_string());

                Ok(JsonResponse::new(json!({
                    "data": BrandingResponse {
                        brand_name,
                        brand_logo_url,
                        brand_theme,
                        tenant_name,
                    }
                }))
                .into_http_response())
            }
            _ => Err(trc::ResourceEvent::NotFound.into_err()),
        }
    }
}
