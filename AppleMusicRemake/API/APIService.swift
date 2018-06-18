//
//  APIService.swift
//  AppleMusicRemake
//
//  Created by Kendall McCaskill on 6/17/18.
//  Copyright © 2018 Kendall McCaskill. All rights reserved.
//

import Foundation
import Alamofire

class APIService {
    
    let baseUrl = "https://itunes.apple.com/search"
    
    //singleton
    static let shared = APIService()
    
    func fetchMusic(searchText: String, completionHandler: @escaping ([Music]) -> ()) {
        
        let parameters = ["term": searchText, "media": "music"]
        
        Alamofire.request(baseUrl, method: .get, parameters: parameters, encoding: URLEncoding.default, headers: nil).responseData { (dataResponse) in
            if let err = dataResponse.error {
                print("Failed to contact yahoo", err)
                return
            }
            
            guard let data = dataResponse.data else { return }
            
            do {
                let searchResult = try JSONDecoder().decode(SearchResults.self, from: data)
                completionHandler(searchResult.results)
//                self.music = searchResult.results
//                self.tableView.reloadData()
            } catch let decodeErr {
                print("Failed to decode:", decodeErr)
            }
        }
    }
    
    struct SearchResults: Decodable {
        let resultCount: Int
        let results: [Music]
    }
    
}
